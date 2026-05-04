import { NextRequest } from "next/server";
import { serveTopologyAsset } from "@/lib/topology-assets";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return serveTopologyAsset(params.path, "private, max-age=300");
}
