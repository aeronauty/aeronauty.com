import "server-only";
import { NextResponse } from "next/server";
import { TileTallyHttpError } from "@/lib/tiletally/http-error";

export { TileTallyHttpError } from "@/lib/tiletally/http-error";

export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new TileTallyHttpError(415, "unsupported_media_type", "Send a JSON request.");
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new TileTallyHttpError(413, "request_too_large", "That request is too large.");
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new TileTallyHttpError(413, "request_too_large", "That request is too large.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TileTallyHttpError(400, "invalid_json", "That request is not valid JSON.");
  }
}

export function tileTallyErrorResponse(error: unknown, operation: string): NextResponse {
  if (error instanceof TileTallyHttpError) {
    return NextResponse.json(
      { error: error.publicMessage, code: error.code },
      { status: error.status }
    );
  }

  // Deliberately log only the error class. Provider and database error bodies can
  // contain private input; no credentials or raw source should reach logs/responses.
  const errorType = error instanceof Error ? error.name : typeof error;
  console.error(`[tile-tally:${operation}] ${errorType}`);
  return NextResponse.json(
    { error: "Tile Tally could not complete that request.", code: "internal_error" },
    { status: 500 }
  );
}
