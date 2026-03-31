"use client";

import { useState, useMemo } from "react";
import { useDashboardStore } from "@/lib/dashboard-store";
import { useWeather, useRadar } from "./useWeather";
import { getWeatherInfo } from "@/lib/weather-codes";
import {
  Sun, CloudSun, Cloud, CloudDrizzle, CloudRain, CloudRainWind,
  CloudSnow, CloudLightning, CloudFog, Wind, Droplets, Thermometer,
  Sunrise, Sunset, ShieldAlert, Umbrella,
} from "lucide-react";

type WeatherTab = "now" | "hourly" | "forecast" | "radar";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sun, CloudSun, Cloud, CloudDrizzle, CloudRain, CloudRainWind,
  CloudSnow, CloudLightning, CloudFog,
};

function WeatherIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Cloud;
  return <Icon className={className} />;
}

function uvLabel(uv: number): { text: string; color: string } {
  if (uv < 3) return { text: "Low", color: "text-green-400" };
  if (uv < 6) return { text: "Moderate", color: "text-yellow-400" };
  if (uv < 8) return { text: "High", color: "text-orange-400" };
  if (uv < 11) return { text: "Very High", color: "text-red-400" };
  return { text: "Extreme", color: "text-purple-400" };
}

export default function WeatherWidget() {
  const location = useDashboardStore((s) => s.weatherLocation);
  const { weather, loading } = useWeather(location?.lat ?? null, location?.lon ?? null);
  const radar = useRadar();
  const [tab, setTab] = useState<WeatherTab>("now");

  if (!location) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col">
        <div className="drag-handle cursor-grab text-xs text-gray-400 mb-2">Weather</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm text-center">Set a weather location in Settings</p>
        </div>
      </div>
    );
  }

  if (loading && !weather) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col">
        <div className="drag-handle cursor-grab text-xs text-gray-400 mb-2">Weather</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading weather…</p>
        </div>
      </div>
    );
  }

  if (!weather) return null;

  const currentInfo = getWeatherInfo(weather.current.weatherCode);
  const todayDaily = weather.daily[0];
  const uv = uvLabel(weather.current.uvIndex);

  return (
    <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header with location + tabs */}
      <div className="drag-handle cursor-grab flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 truncate">{location.name}</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-3">
        {(["now", "hourly", "forecast", "radar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 text-xs rounded-lg touch-manipulation transition-colors ${
              tab === t
                ? "bg-blue-600 text-white"
                : "bg-gray-800/60 text-gray-400 hover:text-white"
            }`}
          >
            {t === "now" ? "Now" : t === "hourly" ? "Hourly" : t === "forecast" ? "7-Day" : "Radar"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "now" && <NowTab weather={weather} currentInfo={currentInfo} todayDaily={todayDaily} uv={uv} />}
        {tab === "hourly" && <HourlyTab weather={weather} />}
        {tab === "forecast" && <ForecastTab weather={weather} />}
        {tab === "radar" && <RadarTab lat={location.lat} lon={location.lon} radar={radar} />}
      </div>
    </div>
  );
}

// ── Now Tab ──────────────────────────────────────────────
function NowTab({
  weather,
  currentInfo,
  todayDaily,
  uv,
}: {
  weather: NonNullable<ReturnType<typeof useWeather>["weather"]>;
  currentInfo: ReturnType<typeof getWeatherInfo>;
  todayDaily: NonNullable<ReturnType<typeof useWeather>["weather"]>["daily"][0] | undefined;
  uv: { text: string; color: string };
}) {
  return (
    <div className="h-full flex flex-col">
      {/* Current conditions */}
      <div className="flex items-center gap-3 mb-3">
        <WeatherIcon name={currentInfo.icon} className="w-10 h-10 text-yellow-300 flex-shrink-0" />
        <div>
          <div className="text-3xl font-light">
            {Math.round(weather.current.temperature)}{weather.temperatureUnit}
          </div>
          <div className="text-sm text-gray-400">{currentInfo.label}</div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <Thermometer className="w-3 h-3" />
          Feels {Math.round(weather.current.apparentTemperature)}°
        </span>
        <span className="flex items-center gap-1.5">
          <Wind className="w-3 h-3" />
          {Math.round(weather.current.windSpeed)} km/h
        </span>
        <span className="flex items-center gap-1.5">
          <Droplets className="w-3 h-3" />
          {weather.current.humidity}%
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3" />
          UV <span className={uv.color}>{weather.current.uvIndex.toFixed(0)} {uv.text}</span>
        </span>
        {todayDaily && (
          <>
            <span className="flex items-center gap-1.5">
              <Sunrise className="w-3 h-3" />
              {new Date(todayDaily.sunrise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="flex items-center gap-1.5">
              <Sunset className="w-3 h-3" />
              {new Date(todayDaily.sunset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </>
        )}
      </div>

      {/* High / Low */}
      {todayDaily && (
        <div className="mt-auto pt-2 flex items-center justify-center gap-4 text-sm">
          <span className="text-red-400">▲ {Math.round(todayDaily.tempMax)}°</span>
          <span className="text-blue-400">▼ {Math.round(todayDaily.tempMin)}°</span>
          {todayDaily.precipProbabilityMax > 0 && (
            <span className="flex items-center gap-1 text-cyan-400">
              <Umbrella className="w-3.5 h-3.5" />
              {todayDaily.precipProbabilityMax}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hourly Tab ──────────────────────────────────────────────
function HourlyTab({ weather }: { weather: NonNullable<ReturnType<typeof useWeather>["weather"]> }) {
  // Show next 24 hours from current hour
  const hours = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().slice(0, 10);

    const startIdx = weather.hourly.findIndex((h) => {
      const hDate = new Date(h.time);
      return hDate.toISOString().slice(0, 10) === todayStr && hDate.getHours() >= currentHour;
    });

    return weather.hourly.slice(Math.max(0, startIdx), Math.max(0, startIdx) + 24);
  }, [weather.hourly]);

  return (
    <div className="h-full overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
      {hours.map((hour) => {
        const info = getWeatherInfo(hour.weatherCode);
        const d = new Date(hour.time);
        const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const isNow = Math.abs(d.getTime() - Date.now()) < 3600000;

        return (
          <div
            key={hour.time}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isNow ? "bg-blue-600/20" : ""}`}
          >
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">{timeStr}</span>
            <WeatherIcon name={info.icon} className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <span className="text-sm flex-1">{Math.round(hour.temperature)}°</span>
            {hour.precipProbability > 0 && (
              <span className="text-xs text-cyan-400 flex items-center gap-0.5">
                <Droplets className="w-3 h-3" />
                {hour.precipProbability}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Forecast Tab ──────────────────────────────────────────────
function ForecastTab({ weather }: { weather: NonNullable<ReturnType<typeof useWeather>["weather"]> }) {
  return (
    <div className="h-full overflow-y-auto space-y-1 pr-1 scrollbar-thin">
      {weather.daily.map((day) => {
        const info = getWeatherInfo(day.weatherCode);
        const d = new Date(day.date + "T12:00:00");
        const isToday = new Date().toISOString().slice(0, 10) === day.date;
        const dayLabel = isToday ? "Today" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

        return (
          <div key={day.date} className={`flex items-center gap-2 px-2 py-2 rounded-lg ${isToday ? "bg-blue-600/20" : ""}`}>
            <span className="text-xs w-20 flex-shrink-0 truncate">{dayLabel}</span>
            <WeatherIcon name={info.icon} className="w-5 h-5 text-gray-300 flex-shrink-0" />
            <div className="flex-1 flex items-center gap-1">
              {/* Temperature bar */}
              <span className="text-xs text-blue-400 w-8 text-right">{Math.round(day.tempMin)}°</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden mx-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-orange-500"
                  style={{
                    marginLeft: `${((day.tempMin - (weather.daily[0]?.tempMin ?? 0)) / Math.max(1, (weather.daily[0]?.tempMax ?? 30) - (weather.daily[0]?.tempMin ?? 0))) * 100}%`,
                    width: `${((day.tempMax - day.tempMin) / Math.max(1, (weather.daily[0]?.tempMax ?? 30) - (weather.daily[0]?.tempMin ?? 0))) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs text-red-400 w-8">{Math.round(day.tempMax)}°</span>
            </div>
            {day.precipProbabilityMax > 0 && (
              <span className="text-[10px] text-cyan-400 w-8 text-right">{day.precipProbabilityMax}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Radar Tab ──────────────────────────────────────────────
function RadarTab({ lat, lon, radar }: { lat: number; lon: number; radar: ReturnType<typeof useRadar> }) {
  if (!radar || radar.frames.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading radar…</p>
      </div>
    );
  }

  const latestFrame = radar.frames[radar.frames.length - 1];
  // RainViewer tile: use zoom 6 for regional view
  // Convert lat/lon to tile coordinates
  const zoom = 6;
  const tileX = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );

  // Build a 3x3 grid of tiles centered on user location for a wider view
  const tiles: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({ x: tileX + dx, y: tileY + dy });
    }
  }

  const tileUrl = (x: number, y: number) =>
    `${radar.host}${latestFrame.path}/256/${zoom}/${x}/${y}/2/1_1.png`;

  // OSM base map tiles
  const osmUrl = (x: number, y: number) =>
    `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  const frameTime = new Date(latestFrame.time * 1000);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative overflow-hidden rounded-lg">
        {/* 3x3 tile grid */}
        <div className="grid grid-cols-3 w-full h-full">
          {tiles.map(({ x, y }) => (
            <div key={`${x}-${y}`} className="relative">
              <img
                src={osmUrl(x, y)}
                alt=""
                className="w-full h-full object-cover opacity-40"
                loading="lazy"
              />
              <img
                src={tileUrl(x, y)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-70"
                loading="lazy"
              />
            </div>
          ))}
        </div>
        {/* Center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3 h-3 border-2 border-white/60 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
        <span>Rain Viewer</span>
        <span>{frameTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}
