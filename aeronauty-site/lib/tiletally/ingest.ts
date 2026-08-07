import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import { tileTallyPendingActionSchema } from "@/lib/tiletally/schemas";
import type { TileTallyPendingAction, TileTallySource } from "@/lib/tiletally/types";

type PendingEventInput = {
  action: TileTallyPendingAction;
  inputTokens: number;
  model: string;
  outputTokens: number;
  ownerId: string;
  photoId?: string;
  rawInput?: string;
  source: Exclude<TileTallySource, "manual">;
};

type NonWriteEventInput = {
  inputTokens: number;
  model?: string;
  outputTokens: number;
  ownerId: string;
  status: "answered" | "failed";
} & (
  | { photoId?: never; rawInput: string; source: "chat" | "voice" }
  | { photoId: string; rawInput?: never; source: "photo" }
);

export async function createPendingIngestEvent(
  client: SupabaseClient,
  input: PendingEventInput
): Promise<string> {
  const validatedAction = tileTallyPendingActionSchema.safeParse(input.action);
  if (!validatedAction.success) {
    throw new TileTallyHttpError(502, "invalid_ai_action", "Tile Tally AI proposed invalid data.");
  }

  const { data, error } = await client
    .from("tiletally_ingest_events")
    .insert({
      owner_id: input.ownerId,
      kind: input.source,
      status: "pending",
      raw_input: input.rawInput?.slice(0, 10_000) ?? null,
      photo_id: input.photoId ?? null,
      model: input.model.slice(0, 200),
      input_tokens: Math.max(0, input.inputTokens),
      output_tokens: Math.max(0, input.outputTokens),
      proposed_action: validatedAction.data,
      game_id: null,
    })
    .select("id")
    .single();

  if (error || !data || typeof data.id !== "string") {
    throw new TileTallyHttpError(
      502,
      "pending_action_unavailable",
      "Could not save the proposed Tile Tally action."
    );
  }
  return data.id;
}

export async function recordNonWriteIngestEvent(
  client: SupabaseClient,
  input: NonWriteEventInput
): Promise<void> {
  const { error } = await client.from("tiletally_ingest_events").insert({
    owner_id: input.ownerId,
    kind: input.source,
    status: input.status,
    raw_input: input.source === "photo" ? null : input.rawInput.slice(0, 10_000),
    photo_id: input.source === "photo" ? input.photoId : null,
    model: input.model?.slice(0, 200) ?? null,
    input_tokens: Math.max(0, input.inputTokens),
    output_tokens: Math.max(0, input.outputTokens),
    proposed_action: null,
    game_id: null,
  });
  if (error) {
    throw new TileTallyHttpError(
      502,
      "ingest_log_unavailable",
      "Could not preserve this Tile Tally AI interaction."
    );
  }
}

/** Updates preview data only; no game/turn rows are written here. */
export async function revisePendingIngestEvent(
  client: SupabaseClient,
  ownerId: string,
  eventId: string,
  action: TileTallyPendingAction
): Promise<TileTallyPendingAction> {
  const parsed = tileTallyPendingActionSchema.safeParse(action);
  if (!parsed.success) {
    throw new TileTallyHttpError(400, "invalid_action", "Check the proposed game data.");
  }

  const { data, error } = await client
    .from("tiletally_ingest_events")
    .update({ proposed_action: parsed.data })
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new TileTallyHttpError(502, "revise_failed", "Could not update that proposal.");
  }
  if (!data) {
    throw new TileTallyHttpError(409, "not_pending", "That proposal is no longer pending.");
  }
  return parsed.data;
}

export async function rejectPendingIngestEvent(
  client: SupabaseClient,
  ownerId: string,
  eventId: string
): Promise<void> {
  const { data, error } = await client
    .from("tiletally_ingest_events")
    .update({ status: "rejected" })
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    throw new TileTallyHttpError(502, "reject_failed", "Could not discard that proposal.");
  }
  if (!data) {
    throw new TileTallyHttpError(409, "not_pending", "That proposal is no longer pending.");
  }
}

/**
 * The only commit input is an event id. The security-invoker RPC locks the
 * caller-owned pending event and commits its server-stored proposed_action.
 */
export async function commitPendingIngestEvent(
  client: SupabaseClient,
  eventId: string
): Promise<unknown> {
  const { data, error } = await client.rpc("tiletally_commit_ingest_event", {
    p_event_id: eventId,
  });
  if (error || data == null) {
    throw new TileTallyHttpError(
      409,
      "commit_failed",
      "Could not commit that proposal. It may already have been saved."
    );
  }
  return data;
}
