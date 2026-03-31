"use client";

import { useState, useEffect } from "react";
import { useDashboardStore, type BackgroundTheme } from "@/lib/dashboard-store";
import { usePhotos } from "./usePhotos";

// Curated public-domain art & photography collections
const PHOTO_COLLECTIONS: Record<string, { urls: string[]; label: string }> = {
  classic: {
    label: "Classic Art",
    urls: [
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1920&q=80",
      "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=1920&q=80",
      "https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=1920&q=80",
      "https://images.unsplash.com/photo-1580136579312-94651dfd596d?w=1920&q=80",
      "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=1920&q=80",
    ],
  },
  nature: {
    label: "Nature",
    urls: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80",
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80",
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80",
      "https://images.unsplash.com/photo-1518173946687-a1e3d1893226?w=1920&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80",
    ],
  },
  space: {
    label: "Cosmos",
    urls: [
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80",
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80",
      "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1920&q=80",
      "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
      "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80",
    ],
  },
  architecture: {
    label: "Architecture",
    urls: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&q=80",
      "https://images.unsplash.com/photo-1481026469463-66327c86e544?w=1920&q=80",
      "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=1920&q=80",
      "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&q=80",
      "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1920&q=80",
    ],
  },
  moody: {
    label: "Moody",
    urls: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80",
      "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80",
      "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&q=80",
      "https://images.unsplash.com/photo-1489864341077-a30e23a31470?w=1920&q=80",
      "https://images.unsplash.com/photo-1478065557800-3d15c8c40b1d?w=1920&q=80",
    ],
  },
};

// Slow cycle, no animation — just swap the image
const CYCLE_INTERVAL = 60_000;

function CollectionBackground({ theme }: { theme: BackgroundTheme }) {
  const collection = PHOTO_COLLECTIONS[theme];
  const urls = collection?.urls ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (urls.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % urls.length), CYCLE_INTERVAL);
    return () => clearInterval(id);
  }, [urls]);

  if (!collection || urls.length === 0) return null;

  return (
    <div className="fixed inset-0 z-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${urls[index]})` }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </div>
  );
}

function PhotoBackground() {
  const albumUrl = useDashboardStore((s) => s.albumUrl);
  const { photos } = usePhotos(albumUrl);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), CYCLE_INTERVAL);
    return () => clearInterval(id);
  }, [photos]);

  if (!albumUrl || photos.length === 0) return null;

  return (
    <div className="fixed inset-0 z-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${photos[index]?.url})` }}
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
