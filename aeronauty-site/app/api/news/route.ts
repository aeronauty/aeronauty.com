import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Parser from "rss-parser";

export const dynamic = "force-dynamic";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

interface CacheEntry {
  data: NewsItem[];
  timestamp: number;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let cache: CacheEntry | null = null;

const FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/rss.xml", source: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC Tech" },
  { url: "https://feeds.skynews.com/feeds/rss/home.xml", source: "Sky News" },
] as const;

function truncateSnippet(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

async function fetchAllFeeds(): Promise<NewsItem[]> {
  const parser = new Parser();
  const results: NewsItem[] = [];

  const feedPromises = FEEDS.map(async ({ url, source }) => {
    try {
      const feed = await parser.parseURL(url);
      const items: NewsItem[] = (feed.items ?? []).map((item) => {
        const rawSnippet =
          item.contentSnippet ?? item.content ?? item.summary ?? "";
        // Strip HTML tags if any leak through
        const cleanSnippet = rawSnippet.replace(/<[^>]*>/g, "").trim();

        return {
          title: item.title?.trim() ?? "Untitled",
          link: item.link ?? "",
          source,
          pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
          snippet: truncateSnippet(cleanSnippet, 120),
        };
      });
      return items;
    } catch (err) {
      console.error(`Failed to fetch RSS feed from ${source}:`, err);
      return [];
    }
  });

  const allFeedItems = await Promise.all(feedPromises);
  for (const items of allFeedItems) {
    results.push(...items);
  }

  // Sort by date descending, then limit to 20
  results.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  return results.slice(0, 20);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.labAllowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return cached data if still fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ items: cache.data });
  }

  try {
    const items = await fetchAllFeeds();
    cache = { data: items, timestamp: Date.now() };
    return NextResponse.json({ items });
  } catch (err) {
    console.error("News fetch error:", err);
    // Return stale cache if available
    if (cache) {
      return NextResponse.json({ items: cache.data, stale: true });
    }
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
