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

const COMPUTATIONAL_EXPERIMENTATION_ARTICLE =
  "computational-experimentation/article.html";

/**
 * Reader-only presentation overrides for Computational Experimentation.
 *
 * The article package still carries source/provenance chrome because it is
 * useful in a local editorial build. The live reader should not see it. The
 * prose remains untouched in the Google Doc; this is presentation only.
 */
const COMPUTATIONAL_EXPERIMENTATION_READER_CSS = String.raw`
<style id="computational-experimentation-reader-polish">
  .source-bar,
  .mast > span,
  .foot > span:last-child {
    display: none !important;
  }

  .mast,
  .foot {
    justify-content: flex-start !important;
  }

  .aside {
    --aside-ease: cubic-bezier(.2,.82,.2,1);
    position: relative;
    isolation: isolate;
  }

  .aside-mark {
    position: relative;
    z-index: 2;
    transform: translateY(-.03em) rotate(0deg) scale(1);
    box-shadow:
      0 0 0 0 rgba(66,212,237,0),
      0 0 0 0 rgba(170,133,255,0);
    transition:
      transform .32s var(--aside-ease),
      box-shadow .32s var(--aside-ease),
      background-color .25s ease,
      color .25s ease;
  }

  .aside-mark::before {
    content: "";
    position: absolute;
    inset: -.42rem;
    border: 1px solid rgba(66,212,237,.62);
    border-radius: 999px;
    opacity: 0;
    transform: scale(.55);
    transition:
      opacity .24s ease,
      transform .42s var(--aside-ease);
    pointer-events: none;
  }

  .aside-card {
    bottom: calc(100% + .9rem) !important;
    padding: 1.05rem 1.15rem 1.1rem !important;
    border-color: rgba(111,159,195,.58) !important;
    background:
      linear-gradient(135deg, rgba(66,212,237,.08), transparent 42%),
      linear-gradient(315deg, rgba(170,133,255,.08), transparent 45%),
      #132238 !important;
    box-shadow:
      0 28px 80px rgba(0,0,0,.58),
      0 0 0 1px rgba(255,255,255,.025) inset !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none;
    filter: blur(5px) saturate(.8);
    clip-path: inset(0 0 100% 0 round .8rem);
    transform:
      translate(-50%, .85rem)
      perspective(480px)
      rotateX(-8deg)
      scale(.965) !important;
    transform-origin: 50% 100%;
    transition:
      opacity .18s ease .02s,
      transform .42s var(--aside-ease),
      filter .28s ease,
      clip-path .42s var(--aside-ease),
      visibility 0s linear .42s !important;
  }

  .aside-card::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -.42rem;
    width: .78rem;
    height: .78rem;
    border-right: 1px solid rgba(111,159,195,.58);
    border-bottom: 1px solid rgba(111,159,195,.58);
    background: #132238;
    transform: translateX(-50%) rotate(45deg);
  }

  .aside.open .aside-card,
  .aside:focus-within .aside-card {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto;
    filter: none;
    clip-path: inset(0 0 0 0 round .8rem);
    transform:
      translate(-50%, 0)
      perspective(480px)
      rotateX(0deg)
      scale(1) !important;
    transition-delay: 0s, 0s, 0s, 0s, 0s !important;
  }

  .aside.open .aside-mark,
  .aside:focus-within .aside-mark {
    color: #07111c;
    background: #8cecff;
    transform: translateY(-.08em) rotate(12deg) scale(1.14);
    box-shadow:
      0 0 0 .28rem rgba(66,212,237,.11),
      0 0 1.25rem rgba(66,212,237,.38);
  }

  .aside.open .aside-mark::before,
  .aside:focus-within .aside-mark::before {
    opacity: .75;
    transform: scale(1);
  }

  @media (hover: hover) and (pointer: fine) {
    .aside:hover .aside-card {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto;
      filter: none;
      clip-path: inset(0 0 0 0 round .8rem);
      transform:
        translate(-50%, 0)
        perspective(480px)
        rotateX(0deg)
        scale(1) !important;
      transition-delay: .08s, .08s, .08s, .08s, 0s !important;
    }

    .aside:hover .aside-mark {
      color: #07111c;
      background: #8cecff;
      transform: translateY(-.08em) rotate(12deg) scale(1.14);
      box-shadow:
        0 0 0 .28rem rgba(66,212,237,.11),
        0 0 1.25rem rgba(66,212,237,.38);
    }

    .aside:hover .aside-mark::before {
      opacity: .75;
      transform: scale(1);
    }
  }

  @media (max-width: 800px) {
    .aside-card {
      bottom: 1rem !important;
      clip-path: inset(100% 0 0 0 round .8rem);
      transform: translateY(1.15rem) scale(.985) !important;
      transform-origin: 50% 100%;
    }

    .aside.open .aside-card,
    .aside:focus-within .aside-card {
      clip-path: inset(0 0 0 0 round .8rem);
      transform: translateY(0) scale(1) !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aside-mark,
    .aside-mark::before,
    .aside-card {
      transition-duration: .01ms !important;
      transition-delay: 0s !important;
    }
  }
</style>
`;

function contentType(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] || "application/octet-stream";
}

function polishReaderHtml(segments: string[], data: Buffer): Buffer {
  if (segments.join("/") !== COMPUTATIONAL_EXPERIMENTATION_ARTICLE) {
    return data;
  }

  const html = data.toString("utf8");
  if (html.includes('id="computational-experimentation-reader-polish"')) {
    return data;
  }

  return Buffer.from(
    html.replace(
      "</head>",
      `${COMPUTATIONAL_EXPERIMENTATION_READER_CSS}</head>`,
    ),
    "utf8",
  );
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

  const data = polishReaderHtml(segments, await readFile(requested));
  return new NextResponse(Uint8Array.from(data), {
    status: 200,
    headers: {
      "Content-Type": contentType(requested),
      "Content-Length": String(data.byteLength),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
