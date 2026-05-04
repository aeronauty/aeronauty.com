import { readFile, stat } from "fs/promises";
import { extname, resolve, sep } from "path";
import { NextResponse } from "next/server";

const PACKAGE_ROOT = resolve(
  process.cwd(),
  "content",
  "private",
  "topology-instinct",
);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function contentType(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] || "application/octet-stream";
}

export async function serveTopologyAsset(
  segments: string[] = [],
  cacheControl = "public, max-age=300",
) {
  if (segments.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const requested = resolve(PACKAGE_ROOT, ...segments);
  if (!requested.startsWith(PACKAGE_ROOT + sep) && requested !== PACKAGE_ROOT) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let info;
  try {
    info = await stat(requested);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (!info.isFile()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const data = await readFile(requested);
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType(requested),
      "Content-Length": String(info.size),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
