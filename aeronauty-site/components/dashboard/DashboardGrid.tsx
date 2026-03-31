"use client";

import { useCallback, useEffect, useState, useMemo, Children, isValidElement } from "react";
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type LayoutItem,
  type ResponsiveLayouts,
  type Layout,
} from "react-grid-layout";
import { useDashboardStore } from "@/lib/dashboard-store";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Row height is smaller (~80px) so widgets can be sized more granularly.
// h: 1 = ~80px (compact, e.g. bins), h: 2 = ~176px, h: 3 = ~272px, h: 4+ = tall
const DEFAULT_LAYOUTS: ResponsiveLayouts<string> = {
  lg: [
    { i: "calendar", x: 0, y: 0, w: 1, h: 5, minW: 1, minH: 3 },
    { i: "schedule", x: 1, y: 0, w: 1, h: 5, minW: 1, minH: 2 },
    { i: "weather", x: 2, y: 0, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "music", x: 2, y: 3, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "news", x: 3, y: 0, w: 1, h: 4, minW: 1, minH: 2 },
    { i: "bins", x: 3, y: 4, w: 1, h: 2, minW: 1, minH: 1 },
  ],
  md: [
    { i: "calendar", x: 0, y: 0, w: 1, h: 5, minW: 1, minH: 3 },
    { i: "schedule", x: 1, y: 0, w: 1, h: 5, minW: 1, minH: 2 },
    { i: "weather", x: 0, y: 5, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "music", x: 1, y: 5, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "news", x: 0, y: 8, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "bins", x: 1, y: 8, w: 1, h: 2, minW: 1, minH: 1 },
  ],
  sm: [
    { i: "calendar", x: 0, y: 0, w: 1, h: 5, minW: 1, minH: 3 },
    { i: "schedule", x: 0, y: 5, w: 1, h: 4, minW: 1, minH: 2 },
    { i: "weather", x: 0, y: 9, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "music", x: 0, y: 12, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "news", x: 0, y: 15, w: 1, h: 3, minW: 1, minH: 2 },
    { i: "bins", x: 0, y: 18, w: 1, h: 2, minW: 1, minH: 1 },
  ],
};

const BREAKPOINTS = { lg: 1024, md: 768, sm: 0 };
const COLS = { lg: 4, md: 2, sm: 1 };

interface Props {
  children: React.ReactNode[];
}

export default function DashboardGrid({ children }: Props) {
  const gridLayouts = useDashboardStore((s) => s.gridLayouts);
  const setGridLayouts = useDashboardStore((s) => s.setGridLayouts);
  const locked = useDashboardStore((s) => s.gridLocked);
  const hiddenWidgets = useDashboardStore((s) => s.hiddenWidgets);
  const [rowHeight, setRowHeight] = useState(300);
  const { containerRef, width } = useContainerWidth({ measureBeforeMount: true });

  useEffect(() => {
    const updateHeight = () => {
      const available = window.innerHeight - 84;
      // Smaller row units (~80px) allow finer vertical sizing
      setRowHeight(Math.floor(available / 7));
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Merge stored layouts with defaults so new widgets appear even if layout was saved
  const layouts: ResponsiveLayouts<string> = (() => {
    const hasStored = Object.keys(gridLayouts).length > 0;
    if (!hasStored) return DEFAULT_LAYOUTS;

    const stored = gridLayouts as unknown as ResponsiveLayouts<string>;
    const merged: Record<string, LayoutItem[]> = {};

    for (const [bp, defaults] of Object.entries(DEFAULT_LAYOUTS)) {
      const storedBp = stored[bp] ?? [];
      const storedIds = new Set(storedBp.map((item) => item.i));
      // Add any default items that aren't in stored layout (new widgets)
      const missing = (defaults ?? []).filter((item) => !storedIds.has(item.i));
      merged[bp] = [...storedBp, ...missing];
    }

    return merged as ResponsiveLayouts<string>;
  })();

  // Filter out hidden widgets from layouts
  const filteredLayouts = useMemo(() => {
    if (hiddenWidgets.length === 0) return layouts;
    const hidden = new Set(hiddenWidgets);
    const result: Record<string, LayoutItem[]> = {};
    for (const [bp, items] of Object.entries(layouts)) {
      if (items) result[bp] = items.filter((item) => !hidden.has(item.i));
    }
    return result as ResponsiveLayouts<string>;
  }, [layouts, hiddenWidgets]);

  // Filter out hidden children
  const visibleChildren = useMemo(() => {
    if (hiddenWidgets.length === 0) return children;
    const hidden = new Set(hiddenWidgets);
    return Children.toArray(children).filter((child) => {
      if (isValidElement(child) && typeof child.key === "string") {
        // React prefixes keys with "." so strip it
        const key = child.key.replace(/^\.\$/, "");
        return !hidden.has(key);
      }
      return true;
    });
  }, [children, hiddenWidgets]);

  const handleLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts<string>) => {
      const mutable: Record<string, LayoutItem[]> = {};
      for (const [key, layout] of Object.entries(allLayouts)) {
        if (layout) mutable[key] = [...layout];
      }
      setGridLayouts(mutable);
    },
    [setGridLayouts]
  );

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="w-full">
      {width > 0 && (
        <Responsive
          className="dashboard-grid"
          width={width}
          layouts={filteredLayouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={rowHeight}
          margin={[16, 16] as const}
          dragConfig={{
            enabled: !locked,
            handle: ".drag-handle",
          }}
          resizeConfig={{
            enabled: !locked,
          }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {visibleChildren}
        </Responsive>
      )}
    </div>
  );
}
