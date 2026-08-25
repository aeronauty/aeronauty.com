import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const ROOT = path.join(process.cwd(), "content/private/computational-experimentation");
const TYPES: Record<string,string> = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
  ".webp":"image/webp", ".txt":"text/plain; charset=utf-8",
};
function safePath(parts:string[]) {
  const file = path.normalize(path.join(ROOT,...parts));
  return file.startsWith(ROOT + path.sep) || file === ROOT ? file : null;
}
export async function GET(_request:NextRequest,{params}:{params:{path:string[]}}) {
  const file = safePath(params.path ?? []);
  if (!file) return NextResponse.json({error:"Invalid path"},{status:400});
  try {
    const body = await fs.readFile(file);
    return new NextResponse(body,{headers:{
      "content-type":TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control":"private, no-store", "x-content-type-options":"nosniff",
    }});
  } catch { return NextResponse.json({error:"Not found"},{status:404}); }
}
