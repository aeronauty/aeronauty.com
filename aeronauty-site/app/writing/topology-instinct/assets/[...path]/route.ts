import { NextRequest, NextResponse } from "next/server";
import { serveTopologyAsset } from "@/lib/topology-assets";

const COMPUTATIONAL_EXPERIMENTATION_RUNTIME_ASSETS = new Set([
  "computational-experimentation/article.html",
  "computational-experimentation/article-source.md",
  "computational-experimentation/obi-wan-nairobi.jpg",
  "computational-experimentation/vortex-core.js",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const assetPath = params.path.join("/");
  if (
    params.path[0] === "computational-experimentation" &&
    !COMPUTATIONAL_EXPERIMENTATION_RUNTIME_ASSETS.has(assetPath)
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = await serveTopologyAsset(params.path, "public, max-age=300", {
    stripSourceProvenance: true,
  });
  if (params.path.at(-1) !== "article.html") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}
