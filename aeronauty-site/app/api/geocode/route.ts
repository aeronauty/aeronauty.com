import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q param" }, { status: 400 });

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocode error: ${res.status}`);
    const data = await res.json();
    const results = (data.results ?? []).map((r: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      country: r.country,
      admin1: r.admin1,
    }));
    return NextResponse.json(results);
  } catch (err) {
    console.error("Geocode error:", err);
    return NextResponse.json({ error: "Failed to geocode" }, { status: 500 });
  }
}
