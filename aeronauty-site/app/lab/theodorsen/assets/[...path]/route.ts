import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "content/private/theodorsen");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function safePath(parts: string[]) {
  const joined = path.normalize(path.join(ROOT, ...parts));
  if (!joined.startsWith(ROOT)) return null;
  return joined;
}

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const file = safePath(params.path ?? []);
  if (!file) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

  try {
    const body = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    return new NextResponse(body, {
      headers: {
        "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
