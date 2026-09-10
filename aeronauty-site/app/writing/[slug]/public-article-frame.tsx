"use client";

import { useCallback, useEffect, useRef } from "react";

type PublicArticleFrameProps = {
  src: string;
  title: string;
};

export function PublicArticleFrame({ src, title }: PublicArticleFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const removeFrameNavigationHandlerRef = useRef<(() => void) | null>(null);
  const hashSyncTimeoutsRef = useRef<number[]>([]);

  const syncOuterHashToArticle = useCallback(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const frame = iframeRef.current;
    const frameWindow = frame?.contentWindow;
    const frameDocument = frame?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    let targetId = hash.slice(1);
    try {
      targetId = decodeURIComponent(targetId);
    } catch {
      // Keep the literal fragment if it is not valid percent-encoding.
    }

    const target = frameDocument.getElementById(targetId);
    if (!target) return;

    try {
      frameWindow.history.replaceState(
        null,
        "",
        `${frameWindow.location.pathname}${frameWindow.location.search}${hash}`,
      );
    } catch {
      // Scrolling is the important part; an iframe history update is optional.
    }

    target.scrollIntoView({ block: "start" });
  }, []);

  const prepareArticleFrame = useCallback(() => {
    removeFrameNavigationHandlerRef.current?.();
    hashSyncTimeoutsRef.current.forEach(window.clearTimeout);
    hashSyncTimeoutsRef.current = [];

    const frame = iframeRef.current;
    const frameWindow = frame?.contentWindow;
    const frameDocument = frame?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    const aeronautyHosts = new Set(["aeronauty.com", "www.aeronauty.com"]);
    const isAeronautyLink = (url: URL) =>
      url.origin === frameWindow.location.origin || aeronautyHosts.has(url.hostname);

    frameDocument.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
      const rawHref = link.getAttribute("href") ?? "";
      if (!rawHref || rawHref.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(rawHref, frameWindow.location.href);
      } catch {
        return;
      }

      if (isAeronautyLink(url)) {
        link.target = "_top";
      } else {
        link.target ||= "_blank";
        const rel = new Set(link.rel.split(/\s+/).filter(Boolean));
        rel.add("noopener");
        link.rel = Array.from(rel).join(" ");
      }
    });

    const navigateOuterPage = (event: MouseEvent) => {
      const eventTarget = event.target as HTMLElement | null;
      const link = eventTarget?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const rawHref = link.getAttribute("href") ?? "";
      if (!rawHref || rawHref.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(rawHref, frameWindow.location.href);
      } catch {
        return;
      }

      if (!isAeronautyLink(url)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(url.href);
    };

    frameDocument.addEventListener("click", navigateOuterPage, true);
    removeFrameNavigationHandlerRef.current = () =>
      frameDocument.removeEventListener("click", navigateOuterPage, true);

    syncOuterHashToArticle();
    if (window.location.hash) {
      hashSyncTimeoutsRef.current = [150, 750, 2_000].map((delay) =>
        window.setTimeout(syncOuterHashToArticle, delay),
      );
    }
  }, [syncOuterHashToArticle]);

  useEffect(() => {
    window.addEventListener("hashchange", syncOuterHashToArticle);
    const frame = window.requestAnimationFrame(prepareArticleFrame);

    return () => {
      window.removeEventListener("hashchange", syncOuterHashToArticle);
      window.cancelAnimationFrame(frame);
      removeFrameNavigationHandlerRef.current?.();
      hashSyncTimeoutsRef.current.forEach(window.clearTimeout);
    };
  }, [prepareArticleFrame, syncOuterHashToArticle]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      className="block h-full w-full flex-1 border-0"
      style={{ minHeight: "calc(100vh - 49px)" }}
      onLoad={prepareArticleFrame}
    />
  );
}
