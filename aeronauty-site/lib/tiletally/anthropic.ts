import "server-only";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import { reconcileAiBudget, reserveAiBudget } from "@/lib/tiletally/rate-limit";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 45_000;

export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
};

export type AnthropicTextBlock = { type: "text"; text: string };
export type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | Record<string, unknown>;

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type AnthropicResult = {
  content: AnthropicContentBlock[];
  inputTokens: number;
  model: string;
  outputTokens: number;
  stopReason: string | null;
};

type AnthropicCall = {
  userId: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tools?: AnthropicToolDefinition[];
  forceTool?: string;
};

function readMaxTokens(): number {
  const parsed = Number(process.env.TILETALLY_AI_MAX_TOKENS ?? "1200");
  if (!Number.isInteger(parsed)) return 1_200;
  return Math.max(256, Math.min(4_096, parsed));
}

export function getTileTallyClaudeModel(kind: "chat" | "vision"): string {
  const model =
    kind === "vision"
      ? process.env.TILETALLY_CLAUDE_VISION_MODEL ?? process.env.TILETALLY_CLAUDE_MODEL
      : process.env.TILETALLY_CLAUDE_MODEL;
  if (!model?.trim()) {
    throw new TileTallyHttpError(
      503,
      "ai_not_configured",
      "Tile Tally AI is not configured yet."
    );
  }
  return model.trim();
}

function estimateInputTokens(value: unknown): number {
  let encodedImageCharacters = 0;
  const serialized = JSON.stringify(value, (key, item: unknown) => {
    if (key === "data" && typeof item === "string" && item.length > 1_000) {
      encodedImageCharacters += item.length;
      return `[image data:${item.length}]`;
    }
    return item;
  });
  const textEstimate = Math.ceil(serialized.length / 3.5);
  // This is deliberately conservative enough for cap reservation without
  // treating base64 as ordinary text (which would over-reserve by megatokens).
  const imageEstimate = Math.ceil(encodedImageCharacters / 500);
  return Math.max(1, textEstimate + imageEstimate);
}

function isContentBlock(value: unknown): value is AnthropicContentBlock {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { type?: unknown }).type === "string"
  );
}

function parseProviderResponse(value: unknown): AnthropicResult {
  if (!value || typeof value !== "object") {
    throw new TileTallyHttpError(502, "ai_bad_response", "Tile Tally AI returned an invalid response.");
  }
  const row = value as Record<string, unknown>;
  const usage = row.usage as Record<string, unknown> | undefined;
  const content = Array.isArray(row.content) ? row.content.filter(isContentBlock) : [];
  const model = typeof row.model === "string" ? row.model : "unknown";
  const inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
  const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
  const stopReason = typeof row.stop_reason === "string" ? row.stop_reason : null;

  if (content.length === 0 || inputTokens < 0 || outputTokens < 0) {
    throw new TileTallyHttpError(502, "ai_bad_response", "Tile Tally AI returned an invalid response.");
  }
  return { content, model, inputTokens, outputTokens, stopReason };
}

export async function callTileTallyClaude(input: AnthropicCall): Promise<AnthropicResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new TileTallyHttpError(
      503,
      "ai_not_configured",
      "Tile Tally AI is not configured yet."
    );
  }

  const maxTokens = readMaxTokens();
  const requestBody = {
    model: input.model,
    max_tokens: maxTokens,
    system: input.system,
    messages: input.messages,
    ...(input.tools?.length
      ? {
          tools: input.tools,
          tool_choice: input.forceTool
            ? { type: "tool", name: input.forceTool, disable_parallel_tool_use: true }
            : { type: "auto", disable_parallel_tool_use: true },
        }
      : {}),
  };
  const reservation = await reserveAiBudget(
    input.userId,
    estimateInputTokens(requestBody) + maxTokens
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    // Keep the worst-case reservation: a timed-out provider request may still
    // have run, and retaining it is the cost-safe failure mode.
    throw new TileTallyHttpError(503, "ai_unavailable", "Tile Tally AI is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const status = response.status === 429 ? 429 : 503;
    throw new TileTallyHttpError(
      status,
      response.status === 429 ? "ai_provider_limit" : "ai_unavailable",
      response.status === 429
        ? "Tile Tally AI is busy. Try again shortly."
        : "Tile Tally AI is temporarily unavailable."
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new TileTallyHttpError(502, "ai_bad_response", "Tile Tally AI returned an invalid response.");
  }
  const result = parseProviderResponse(payload);
  await reconcileAiBudget(reservation, result.inputTokens + result.outputTokens);
  return result;
}

export function anthropicText(content: AnthropicContentBlock[]): string {
  return content
    .filter((block): block is AnthropicTextBlock => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function anthropicToolUses(content: AnthropicContentBlock[]): AnthropicToolUseBlock[] {
  return content.filter(
    (block): block is AnthropicToolUseBlock =>
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string" &&
      "input" in block
  );
}
