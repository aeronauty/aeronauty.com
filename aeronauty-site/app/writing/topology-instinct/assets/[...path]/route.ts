import { NextRequest } from "next/server";
import { serveTopologyAsset } from "@/lib/topology-assets";

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return serveTopologyAsset(params.path, "public, max-age=300");
}
