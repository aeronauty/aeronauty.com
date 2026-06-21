"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps an HTML fragment/document into a minimal page and injects a height
 * reporter, so the parent can size the iframe to its content — the page then
 * scrolls as one (scrollytelling), with no nested scrollbar.
 */
function wrapDoc(html: string): string {
  const reporter =
    "(function(){function r(){try{var b=document.body,d=document.documentElement;" +
    "var h=Math.max(b.scrollHeight,b.offsetHeight,d.scrollHeight,d.offsetHeight);" +
    "parent.postMessage({__aeroEmbed:true,height:h},'*');}catch(e){}}" +
    "window.addEventListener('load',r);window.addEventListener('resize',r);" +
    "if(window.ResizeObserver){try{new ResizeObserver(r).observe(document.body);}catch(e){}}" +
    "setInterval(r,1000);r();})();";
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<base target="_blank"><style>html,body{margin:0;padding:0;background:#f4efe4}</style></head>` +
    `<body>${html}<script>${reporter}</script></body></html>`
  );
}

// Sandboxed: scripts run, but the frame has an opaque origin (no access to the
// parent page, cookies, or storage). It can still postMessage its height up.
const SANDBOX = "allow-scripts allow-popups";

export default function HtmlEmbed({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(700);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        ref.current &&
        event.source === ref.current.contentWindow &&
        event.data &&
        (event.data as { __aeroEmbed?: boolean }).__aeroEmbed
      ) {
        const h = Number((event.data as { height?: number }).height);
        if (h > 0 && h < 40000) setHeight(Math.ceil(h));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    // Full-bleed on desktop (breaks out of the prose column to fill the viewport
    // width); contained on mobile. Height auto-fits content for scrollytelling.
    <div className="relative w-full overflow-hidden rounded-md border border-stone-200 lg:left-1/2 lg:w-screen lg:-translate-x-1/2 lg:rounded-none lg:border-x-0">
      <iframe
        ref={ref}
        title={title}
        srcDoc={wrapDoc(html)}
        sandbox={SANDBOX}
        scrolling="no"
        style={{ height }}
        className="block w-full border-0"
      />
    </div>
  );
}
