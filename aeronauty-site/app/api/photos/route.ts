import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// In-memory cache: token → { urls, fetchedAt }
const cache = new Map<string, { urls: PhotoEntry[]; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface PhotoEntry {
  url: string;
  width: number;
  height: number;
}

function extractToken(albumUrl: string): string | null {
  // https://www.icloud.com/sharedalbum/#BTOKEN
  const hashMatch = albumUrl.match(/#([A-Za-z0-9]+)/);
  if (hashMatch) return hashMatch[1];
  // Sometimes passed as query param
  const tokenMatch = albumUrl.match(/token=([A-Za-z0-9]+)/);
  if (tokenMatch) return tokenMatch[1];
  // Maybe the raw token was passed
  if (/^[A-Z][A-Za-z0-9]{10,}$/.test(albumUrl)) return albumUrl;
  return null;
}

async function tryPartition(
  partition: number,
  token: string,
  path: string,
  body: unknown
): Promise<Response> {
  const url = `https://p${String(partition).padStart(2, "0")}-sharedstreams.icloud.com/${token}/sharedstreams/${path}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://www.icloud.com" },
    body: JSON.stringify(body),
  });
}

async function fetchPhotoUrls(token: string): Promise<PhotoEntry[]> {
  // Try partitions to find the right server
  let streamRes: Response | null = null;
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
    try {
      const res = await tryPartition(p, token, "webstream", { streamCtag: null });
      if (res.ok) {
        streamRes = res;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!streamRes) throw new Error("Could not reach iCloud shared album");

  const streamData = await streamRes.json();
  const photos = streamData.photos ?? [];
  if (photos.length === 0) return [];

  // Collect all photo GUIDs/checksums
  const photoGuids: string[] = [];
  for (const photo of photos) {
    const derivatives = photo.derivatives ?? {};
    // Get the largest derivative
    let bestChecksum: string | null = null;
    let bestSize = 0;
    for (const key of Object.keys(derivatives)) {
      const d = derivatives[key];
      const size = (d.width ?? 0) * (d.height ?? 0);
      if (size > bestSize) {
        bestSize = size;
        bestChecksum = d.checksum;
      }
    }
    if (bestChecksum) photoGuids.push(bestChecksum);
  }

  if (photoGuids.length === 0) return [];

  // Fetch actual CDN URLs
  // Find the partition from the first successful URL
  const partitionMatch = streamRes.url.match(/p(\d+)-/);
  const partition = partitionMatch ? parseInt(partitionMatch[1]) : 1;

  const assetRes = await tryPartition(partition, token, "webasseturls", {
    photoGuids,
  });

  if (!assetRes.ok) throw new Error("Failed to fetch asset URLs");

  const assetData = await assetRes.json();
  const items = assetData.items ?? {};

  const results: PhotoEntry[] = [];
  for (const photo of photos) {
    const derivatives = photo.derivatives ?? {};
    let bestChecksum: string | null = null;
    let bestSize = 0;
    let bestWidth = 0;
    let bestHeight = 0;
    for (const key of Object.keys(derivatives)) {
      const d = derivatives[key];
      const size = (d.width ?? 0) * (d.height ?? 0);
      if (size > bestSize) {
        bestSize = size;
        bestChecksum = d.checksum;
        bestWidth = d.width ?? 0;
        bestHeight = d.height ?? 0;
      }
    }
    if (bestChecksum && items[bestChecksum]) {
      const loc = items[bestChecksum].url_location;
      const path = items[bestChecksum].url_path;
      if (loc && path) {
        results.push({
          url: `https://${loc}${path}`,
          width: bestWidth,
          height: bestHeight,
        });
      }
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const albumUrl = req.nextUrl.searchParams.get("url");
  if (!albumUrl) return NextResponse.json({ error: "Missing url param" }, { status: 400 });

  const token = extractToken(albumUrl);
  if (!token) return NextResponse.json({ error: "Invalid album URL" }, { status: 400 });

  // Check cache
  const cached = cache.get(token);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.urls);
  }

  try {
    const urls = await fetchPhotoUrls(token);
    cache.set(token, { urls, fetchedAt: Date.now() });
    return NextResponse.json(urls);
  } catch (err) {
    console.error("Photo fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}
