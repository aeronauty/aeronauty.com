import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anthropicText,
  anthropicToolUses,
  callTileTallyClaude,
  getTileTallyClaudeModel,
  type AnthropicMessage,
} from "@/lib/tiletally/anthropic";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import {
  createPendingIngestEvent,
  recordNonWriteIngestEvent,
} from "@/lib/tiletally/ingest";
import { parseTileTallyWriteAction, TILE_TALLY_VISION_TOOLS } from "@/lib/tiletally/tools";
import type { TileTallyProposal } from "@/lib/tiletally/types";

const PHOTO_BUCKET = "tiletally-score-photos";
const DEFAULT_MAX_PHOTO_BYTES = 4 * 1024 * 1024;

type PhotoRow = { id: string; owner_id: string; storage_path: string };
type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

function maxPhotoBytes(): number {
  const parsed = Number(process.env.TILETALLY_VISION_MAX_BYTES ?? DEFAULT_MAX_PHOTO_BYTES);
  if (!Number.isInteger(parsed)) return DEFAULT_MAX_PHOTO_BYTES;
  return Math.max(64 * 1024, Math.min(DEFAULT_MAX_PHOTO_BYTES, parsed));
}

function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function visionSystemPrompt(): string {
  return `You extract Tile Tally word-game scores from one user-owned score-sheet photo.

Return exactly one log_game tool proposal. Copy only information actually visible in the image. Never invent names, dates, words, bingos, turns, or corrections. If a mark is uncertain, omit it rather than guessing. Preserve each visible turn as its own turn in reading order. If the sheet contains only final totals, represent each final total as one turn for that player; do not fabricate intermediate turns. Use adjustment rows only when the sheet explicitly shows corrections or leftover-tile changes. Use status "complete" only when the sheet clearly represents a finished game; otherwise use "in_progress". The application will show an editable preview and will not save game rows until the user confirms.`;
}

export async function proposeTileTallyVision(input: {
  client: SupabaseClient;
  photoId: string;
  userId: string;
}): Promise<TileTallyProposal> {
  const { data: photoData, error: photoError } = await input.client
    .from("tiletally_score_photos")
    .select("id,owner_id,storage_path")
    .eq("id", input.photoId)
    .eq("owner_id", input.userId)
    .maybeSingle();
  if (photoError) {
    throw new TileTallyHttpError(502, "photo_unavailable", "Could not load that score photo.");
  }
  if (!photoData) {
    throw new TileTallyHttpError(404, "photo_not_found", "That score photo was not found.");
  }

  const photo = photoData as PhotoRow;
  if (!photo.storage_path.startsWith(`${input.userId}/`)) {
    throw new TileTallyHttpError(403, "photo_path_forbidden", "That score photo is not available.");
  }

  const { data: blob, error: downloadError } = await input.client.storage
    .from(PHOTO_BUCKET)
    .download(photo.storage_path);
  if (downloadError || !blob) {
    throw new TileTallyHttpError(502, "photo_unavailable", "Could not load that score photo.");
  }
  if (blob.size < 1 || blob.size > maxPhotoBytes()) {
    throw new TileTallyHttpError(413, "photo_size", "Use a score photo under the configured size limit.");
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mediaType = sniffImageType(bytes);
  if (!mediaType) {
    throw new TileTallyHttpError(415, "photo_type", "Use a JPEG, PNG, or WebP score photo.");
  }

  const model = getTileTallyClaudeModel("vision");
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: Buffer.from(bytes).toString("base64"),
          },
        },
        {
          type: "text",
          text: "Extract the visible game into one editable Tile Tally proposal.",
        },
      ],
    },
  ];
  const response = await callTileTallyClaude({
    userId: input.userId,
    model,
    system: visionSystemPrompt(),
    messages,
    tools: TILE_TALLY_VISION_TOOLS,
    forceTool: "log_game",
  });
  try {
    const toolUses = anthropicToolUses(response.content);
    if (toolUses.length !== 1 || toolUses[0].name !== "log_game") {
      throw new TileTallyHttpError(502, "invalid_vision_action", "The photo could not be parsed safely.");
    }
    const action = parseTileTallyWriteAction("log_game", toolUses[0].input);
    if (!action) {
      throw new TileTallyHttpError(502, "invalid_vision_action", "The photo could not be parsed safely.");
    }

    const { error: updateError } = await input.client
      .from("tiletally_score_photos")
      .update({ extracted_json: action })
      .eq("id", photo.id)
      .eq("owner_id", input.userId);
    if (updateError) {
      throw new TileTallyHttpError(502, "photo_parse_unavailable", "Could not save the photo preview.");
    }

    const eventId = await createPendingIngestEvent(input.client, {
      action,
      inputTokens: response.inputTokens,
      model: response.model || model,
      outputTokens: response.outputTokens,
      ownerId: input.userId,
      photoId: photo.id,
      source: "photo",
    });

    return {
      reply:
        anthropicText(response.content) ||
        "I extracted this score sheet. Check every row carefully, correct anything uncertain, then choose Save.",
      action,
      eventId,
    };
  } catch (error) {
    await recordNonWriteIngestEvent(input.client, {
      inputTokens: response.inputTokens,
      model: response.model || model,
      outputTokens: response.outputTokens,
      ownerId: input.userId,
      photoId: photo.id,
      source: "photo",
      status: "failed",
    }).catch(() => undefined);
    throw error;
  }
}
