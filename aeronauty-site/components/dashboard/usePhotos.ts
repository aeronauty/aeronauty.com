"use client";

import { useState, useEffect, useCallback } from "react";

interface PhotoEntry {
  url: string;
  width: number;
  height: number;
}

const STALE_TIME = 60 * 60 * 1000; // 1 hour

let cachedPhotos: PhotoEntry[] | null = null;
let cachedUrl: string | null = null;
let cachedAt = 0;

export function usePhotos(albumUrl: string | null) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!albumUrl) {
      setPhotos([]);
      return;
    }

    // Use client-side cache
    if (cachedUrl === albumUrl && cachedPhotos && Date.now() - cachedAt < STALE_TIME) {
      setPhotos(cachedPhotos);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/photos?url=${encodeURIComponent(albumUrl)}`);
      if (!res.ok) throw new Error("Failed to fetch photos");
      const data: PhotoEntry[] = await res.json();
      cachedPhotos = data;
      cachedUrl = albumUrl;
      cachedAt = Date.now();
      setPhotos(data);
    } catch {
      console.error("Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  }, [albumUrl]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  return { photos, loading };
}
