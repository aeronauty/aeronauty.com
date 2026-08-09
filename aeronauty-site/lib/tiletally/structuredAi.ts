import "server-only";
import {
  anthropicToolUses,
  callTileTallyClaude,
  getTileTallyClaudeModel,
  type AnthropicMessage,
} from "@/lib/tiletally/anthropic";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import { reconcileAiBudget, reserveAiBudget } from "@/lib/tiletally/rate-limit";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 60_000;

type StructuredAiTextCall = {
  kind: "chat";
  userId: string;
  requestAlreadyReserved?: boolean;
  instructions: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  schemaName: string;
  schema: Record<string, unknown>;
};

type StructuredAiVisionCall = {
  kind: "vision";
  userId: string;
  requestAlreadyReserved?: boolean;
  instructions: string;
  prompt: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  schemaName: string;
  schema: Record<string, unknown>;
};

export type StructuredAiCall = StructuredAiTextCall | StructuredAiVisionCall;

export type StructuredAiResult = {
  value: unknown;
  model: string;
  provider: "openai" | "anthropic";
  inputTokens: number;
  outputTokens: number;
};

function cleanJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schemaDeclaration, ...clean } = schema;
  return clean;
}

const ANTHROPIC_VALIDATION_ONLY_SCHEMA_KEYS = new Set([
  "default",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "pattern",
]);

/**
 * Anthropic's raw strict-tool endpoint accepts the structural JSON Schema
 * vocabulary but not validation-only bounds such as minimum/maxLength. Its
 * SDK performs this same simplification automatically. We still parse every
 * response with the original Zod schema, so removing these grammar constraints
 * does not weaken the application boundary.
 */
function anthropicCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anthropicCompatibleSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "$schema" && !ANTHROPIC_VALIDATION_ONLY_SCHEMA_KEYS.has(key))
      .map(([key, child]) => [key, anthropicCompatibleSchema(child)]),
  );
}

function maxOutputTokens(kind: StructuredAiCall["kind"]): number {
  const fallback = kind === "vision" ? 4_096 : 2_400;
  const parsed = Number(process.env.TILETALLY_AI_MAX_TOKENS ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(512, Math.min(8_192, parsed));
}

function openAiModel(kind: StructuredAiCall["kind"]): string {
  const model = kind === "vision"
    ? process.env.TILETALLY_OPENAI_VISION_MODEL ?? process.env.TILETALLY_OPENAI_MODEL ?? "gpt-5.6"
    : process.env.TILETALLY_OPENAI_CHAT_MODEL ?? process.env.TILETALLY_OPENAI_MODEL ?? "gpt-5.6";
  return model.trim();
}

function estimateTokens(input: StructuredAiCall, outputTokens: number) {
  const text = input.kind === "vision"
    ? `${input.instructions}\n${input.prompt}`
    : `${input.instructions}\n${input.messages.map((message) => message.content).join("\n")}`;
  const textTokens = Math.ceil(text.length / 3.5);
  // Images are tokenized by size and detail, not as base64 text. This is a
  // conservative budget reservation without charging every encoded byte as a token.
  const imageTokens = input.kind === "vision" ? Math.max(1_000, Math.ceil(input.imageBase64.length / 500)) : 0;
  return textTokens + imageTokens + outputTokens;
}

function providerText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (candidate.type === "refusal" && typeof candidate.refusal === "string") {
        throw new TileTallyHttpError(422, "ai_refused", "The assistant could not process that request safely.");
      }
      return candidate.type === "output_text" && typeof candidate.text === "string" ? [candidate.text] : [];
    });
  }).join("");
}

function usageFromResponse(value: unknown) {
  if (!value || typeof value !== "object") return { inputTokens: 0, outputTokens: 0 };
  const usage = (value as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return { inputTokens: 0, outputTokens: 0 };
  const row = usage as { input_tokens?: unknown; output_tokens?: unknown };
  return {
    inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : 0,
    outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : 0,
  };
}

async function callOpenAiStructured(input: StructuredAiCall): Promise<StructuredAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TileTallyHttpError(503, "ai_not_configured", "Game Ledger AI is not configured yet.");
  const model = openAiModel(input.kind);
  const maxTokens = maxOutputTokens(input.kind);
  const reservation = await reserveAiBudget(
    input.userId,
    estimateTokens(input, maxTokens),
    { requestAlreadyReserved: input.requestAlreadyReserved },
  );
  const requestInput = input.kind === "vision"
    ? [{
        role: "user",
        content: [
          { type: "input_text", text: input.prompt },
          {
            type: "input_image",
            image_url: `data:${input.mediaType};base64,${input.imageBase64}`,
            detail: "high",
          },
        ],
      }]
    : input.messages;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions: input.instructions,
        input: requestInput,
        max_output_tokens: maxTokens,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            schema: cleanJsonSchema(input.schema),
            strict: true,
          },
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new TileTallyHttpError(503, "ai_unavailable", "Game Ledger AI is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.json().catch(() => null) as unknown;
  const usage = usageFromResponse(raw);
  if (!response.ok) {
    // Retain the worst-case reservation: an error response without usage does
    // not prove that the provider performed no billable work.
    throw new TileTallyHttpError(
      response.status === 429 ? 429 : 502,
      "ai_provider_error",
      response.status === 429
        ? "The AI service is busy. Try again shortly."
      : "The AI service could not process that request.",
    );
  }
  await reconcileAiBudget(reservation, usage.inputTokens + usage.outputTokens).catch(() => undefined);
  const text = providerText(raw);
  if (!text) throw new TileTallyHttpError(502, "ai_empty_response", "Game Ledger AI returned no usable answer.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TileTallyHttpError(502, "ai_bad_response", "Game Ledger AI returned an invalid structured answer.");
  }
  const responseModel = raw && typeof raw === "object" && typeof (raw as { model?: unknown }).model === "string"
    ? (raw as { model: string }).model
    : model;
  return { value, model: responseModel, provider: "openai", ...usage };
}

async function callAnthropicStructured(input: StructuredAiCall): Promise<StructuredAiResult> {
  const model = getTileTallyClaudeModel(input.kind);
  const messages: AnthropicMessage[] = input.kind === "vision"
    ? [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 },
          },
          { type: "text", text: input.prompt },
        ],
      }]
    : input.messages;
  const response = await callTileTallyClaude({
    userId: input.userId,
    model,
    system: input.instructions,
    messages,
    maxTokens: maxOutputTokens(input.kind),
    requestAlreadyReserved: input.requestAlreadyReserved,
    tools: [{
      name: input.schemaName,
      description: "Return the complete validated response for the application to review.",
      input_schema: anthropicCompatibleSchema(input.schema) as Record<string, unknown>,
      strict: true,
    }],
    forceTool: input.schemaName,
  });
  const uses = anthropicToolUses(response.content);
  if (uses.length !== 1 || uses[0].name !== input.schemaName) {
    throw new TileTallyHttpError(502, "ai_bad_response", "Game Ledger AI returned an invalid structured answer.");
  }
  return {
    value: uses[0].input,
    model: response.model || model,
    provider: "anthropic",
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}

export async function callStructuredAi(input: StructuredAiCall): Promise<StructuredAiResult> {
  const configured = process.env.TILETALLY_AI_PROVIDER?.trim().toLowerCase();
  if (configured && configured !== "openai" && configured !== "anthropic") {
    throw new TileTallyHttpError(503, "ai_not_configured", "Game Ledger AI has an invalid provider setting.");
  }
  if (configured === "openai") return callOpenAiStructured(input);
  if (configured === "anthropic") return callAnthropicStructured(input);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  if (hasOpenAi && hasAnthropic) {
    throw new TileTallyHttpError(
      503,
      "ai_provider_ambiguous",
      "Choose TILETALLY_AI_PROVIDER when both AI providers are configured.",
    );
  }
  if (hasOpenAi) return callOpenAiStructured(input);
  if (hasAnthropic) return callAnthropicStructured(input);
  throw new TileTallyHttpError(503, "ai_not_configured", "Game Ledger AI is not configured yet.");
}
