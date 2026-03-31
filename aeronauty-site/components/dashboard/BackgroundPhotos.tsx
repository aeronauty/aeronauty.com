"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDashboardStore, type BackgroundTheme } from "@/lib/dashboard-store";
import { usePhotos } from "./usePhotos";

// Curated public-domain art & photography collections
// Sources: Unsplash (free license), picsum.photos (stable IDs)
const PHOTO_COLLECTIONS: Record<string, { urls: string[]; label: string }> = {
  classic: {
    label: "Classic Art",
    urls: [
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1920&q=80", // gallery wall
      "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=1920&q=80", // renaissance ceiling
      "https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=1920&q=80", // museum gallery
      "https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=1920&q=80", // classical painting
      "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=1920&q=80", // art gallery
    ],
  },
  nature: {
    label: "Nature",
    urls: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80", // mountain lake
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80", // misty forest
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80", // sunlit forest
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80", // green hills
      "https://images.unsplash.com/photo-1518173946687-a1e3d1893226?w=1920&q=80", // aurora borealis
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80", // tropical beach
    ],
  },
  space: {
    label: "Cosmos",
    urls: [
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80", // nebula
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80", // earth from space
      "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1920&q=80", // starry sky
      "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80", // milky way
      "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80", // deep space
    ],
  },
  architecture: {
    label: "Architecture",
    urls: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&q=80", // modern building
      "https://images.unsplash.com/photo-1481026469463-66327c86e544?w=1920&q=80", // cathedral interior
      "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=1920&q=80", // geometric ceiling
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&q=80", // spiral staircase
      "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1920&q=80", // white buildings
    ],
  },
  moody: {
    label: "Moody",
    urls: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80", // fog lake
      "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80", // dark forest
      "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&q=80", // stormy sea
      "https://images.unsplash.com/photo-1489864341077-a30e23a31470?w=1920&q=80", // moody mountains
      "https://images.unsplash.com/photo-1478065557800-3d15c8c40b1d?w=1920&q=80", // dark clouds
    ],
  },
};

const CYCLE_INTERVAL = 30_000; // 30 seconds
const KENBURNS_DURATION = 25; // seconds per animation cycle

// Randomized Ken Burns transforms for variety
const KENBURNS_VARIANTS = [
  { from: "scale(1) translate(0%, 0%)", to: "scale(1.15) translate(-3%, -2%)" },
  { from: "scale(1.1) translate(-2%, 0%)", to: "scale(1) translate(2%, 3%)" },
  { from: "scale(1) translate(0%, 0%)", to: "scale(1.12) translate(2%, -3%)" },
  { from: "scale(1.15) translate(3%, 2%)", to: "scale(1) translate(0%, 0%)" },
  { from: "scale(1.05) translate(-1%, 2%)", to: "scale(1.15) translate(1%, -2%)" },
];

function CollectionBackground({ theme }: { theme: BackgroundTheme }) {
  const collection = PHOTO_COLLECTIONS[theme];
  const urls = collection?.urls ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFirst, setShowFirst] = useState(true);
  const [variant, setVariant] = useState(0);
  const preloadRef = useRef<HTMLImageElement | null>(null);

  // Preload first two images
  useEffect(() => {
    if (urls.length > 0) {
      const img = new Image();
      img.src = urls[0];
    }
    if (urls.length > 1) {
      const img = new Image();
      img.src = urls[1];
    }
  }, [urls]);

  // Cycle photos
  useEffect(() => {
    if (urls.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % urls.length;
        const preloadIdx = (next + 1) % urls.length;
        const img = new Image();
        img.src = urls[preloadIdx];
        preloadRef.current = img;
        return next;
      });
      setShowFirst((prev) => !prev);
      setVariant((prev) => (prev + 1) % KENBURNS_VARIANTS.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [urls]);

  if (!collection) return null;

  const prevIndex = (currentIndex - 1 + urls.length) % urls.length;
  const firstUrl = showFirst ? urls[currentIndex] : urls[prevIndex];
  const secondUrl = showFirst ? urls[prevIndex] : urls[currentIndex];
  const activeVariant = KENBURNS_VARIANTS[variant];
  const prevVariant = KENBURNS_VARIANTS[(variant - 1 + KENBURNS_VARIANTS.length) % KENBURNS_VARIANTS.length];

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms]"
        style={{
          backgroundImage: firstUrl ? `url(${firstUrl})` : undefined,
          opacity: showFirst ? 1 : 0,
          animation: showFirst
            ? `kenburns-move ${KENBURNS_DURATION}s ease-in-out infinite alternate`
            : undefined,
          ["--kb-from" as string]: activeVariant?.from,
          ["--kb-to" as string]: activeVariant?.to,
        }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms]"
        style={{
          backgroundImage: secondUrl ? `url(${secondUrl})` : undefined,
          opacity: showFirst ? 0 : 1,
          animation: !showFirst
            ? `kenburns-move ${KENBURNS_DURATION}s ease-in-out infinite alternate`
            : undefined,
          ["--kb-from" as string]: prevVariant?.from,
          ["--kb-to" as string]: prevVariant?.to,
        }}
      />
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/50" />
    </div>
  );
}

function PhotoBackground() {
  const albumUrl = useDashboardStore((s) => s.albumUrl);
  const { photos } = usePhotos(albumUrl);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFirst, setShowFirst] = useState(true);
  const [variant, setVariant] = useState(0);
  const preloadRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % photos.length;
        const preloadIdx = (next + 1) % photos.length;
        const img = new Image();
        img.src = photos[preloadIdx].url;
        preloadRef.current = img;
        return next;
      });
      setShowFirst((prev) => !prev);
      setVariant((prev) => (prev + 1) % KENBURNS_VARIANTS.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [photos]);

  useEffect(() => {
    if (photos.length > 0) {
      const img = new Image();
      img.src = photos[0].url;
    }
    if (photos.length > 1) {
      const img = new Image();
      img.src = photos[1].url;
    }
  }, [photos]);

  if (!albumUrl || photos.length === 0) return null;

  const prevIndex = (currentIndex - 1 + photos.length) % photos.length;
  const firstUrl = showFirst ? photos[currentIndex]?.url : photos[prevIndex]?.url;
  const secondUrl = showFirst ? photos[prevIndex]?.url : photos[currentIndex]?.url;
  const activeVariant = KENBURNS_VARIANTS[variant];
  const prevVariant = KENBURNS_VARIANTS[(variant - 1 + KENBURNS_VARIANTS.length) % KENBURNS_VARIANTS.length];

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms]"
        style={{
          backgroundImage: firstUrl ? `url(${firstUrl})` : undefined,
          opacity: showFirst ? 1 : 0,
          animation: showFirst
            ? `kenburns-move ${KENBURNS_DURATION}s ease-in-out infinite alternate`
            : undefined,
          ["--kb-from" as string]: activeVariant?.from,
          ["--kb-to" as string]: activeVariant?.to,
        }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms]"
        style={{
          backgroundImage: secondUrl ? `url(${secondUrl})` : undefined,
          opacity: showFirst ? 0 : 1,
          animation: !showFirst
            ? `kenburns-move ${KENBURNS_DURATION}s ease-in-out infinite alternate`
            : undefined,
          ["--kb-from" as string]: prevVariant?.from,
          ["--kb-to" as string]: prevVariant?.to,
        }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </div>
  );
}

export default function BackgroundPhotos() {
  const theme = useDashboardStore((s) => s.backgroundTheme);

  if (theme === "none") return null;
  if (theme === "custom") return <PhotoBackground />;
  if (PHOTO_COLLECTIONS[theme]) return <CollectionBackground theme={theme} />;
  return null;
}
