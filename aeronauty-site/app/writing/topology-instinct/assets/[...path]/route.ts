import { NextRequest, NextResponse } from "next/server";
import { serveTopologyAsset } from "@/lib/topology-assets";
import { publicTopologyRuntimeAssetSet } from "@/lib/topology-public-assets";

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const assetPath = params.path.join("/");
  if (!publicTopologyRuntimeAssetSet.has(assetPath)) {
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
