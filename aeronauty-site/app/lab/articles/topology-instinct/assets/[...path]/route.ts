import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { extname, resolve, sep } from "path";

/**
 * Gated asset serving for the topology-instinct article package.
 *
 * Files live under content/private/topology-instinct/ (outside the
 * Next.js public/ tree, so they aren't directly web-accessible). This
 * Route Handler reads them from disk and returns them with a sensible
 * Content-Type. Auth is handled by middleware.ts which gates anything
 * under /lab/* to logged-in lab users.
 *
 * URL shape:
 *   /lab/articles/topology-instinct/assets/article-1.html
 *   /lab/articles/topology-instinct/assets/figures/cartoon-orchestrator.png
 *   /lab/articles/topology-instinct/assets/figures/data-black-market/03-folders.png
 *   /lab/articles/topology-instinct/assets/figures/excel-solari.mp4
 *
 * Path traversal protection: the resolved file path must stay inside
 * the package root, otherwise the request is rejected with 403.
 */

const PACKAGE_ROOT = resolve(
  process.cwd(),
  "content",
  "private",
  "topology-instinct",
);

// Conservative Content-Type table — covers the formats the article uses
// and falls back to octet-stream for anything unexpected.
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm":  "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
};

function contentType(p: string): string {
  return CONTENT_TYPES[extname(p).toLowerCase()] || "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const segments = params.path ?? [];
  if (segments.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Reject any segment that tries to break out of the package or sneak
  // a path-separator past us.
  for (const s of segments) {
    if (s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")) {
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
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
