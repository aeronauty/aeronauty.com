"use client";

import { useState, useEffect, useCallback } from "react";

export interface HourlyData {
  time: string;
  temperature: number;
  weatherCode: number;
  precipProbability: number;
}

export interface DailyData {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  precipProbabilityMax: number;
}

export interface WeatherData {
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
    uvIndex: number;
  };
  hourly: HourlyData[];
  daily: DailyData[];
  temperatureUnit: string;
}

export interface RadarFrame {
  path: string;
  time: number;
}

export interface RadarData {
  host: string;
  frames: RadarFrame[];
}

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes
const RADAR_POLL = 5 * 60 * 1000; // 5 minutes

export function useWeather(lat: number | null, lon: number | null) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchWeather = useCallback(async () => {
    if (lat === null || lon === null) {
      setWeather(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error("Failed to fetch weather");
      const data = await res.json();

      setWeather({
        current: {
          temperature: data.current.temperature_2m,
          apparentTemperature: data.current.apparent_temperature,
          humidity: data.current.relative_humidity_2m,
          windSpeed: data.current.wind_speed_10m,
          weatherCode: data.current.weather_code,
          uvIndex: data.current.uv_index ?? 0,
        },
        hourly: (data.hourly?.time ?? []).map((time: string, i: number) => ({
          time,
          temperature: data.hourly.temperature_2m[i],
          weatherCode: data.hourly.weather_code[i],
          precipProbability: data.hourly.precipitation_probability?.[i] ?? 0,
        })),
        daily: (data.daily?.time ?? []).map((date: string, i: number) => ({
          date,
          weatherCode: data.daily.weather_code[i],
          tempMax: data.daily.temperature_2m_max[i],
          tempMin: data.daily.temperature_2m_min[i],
          sunrise: data.daily.sunrise?.[i] ?? "",
          sunset: data.daily.sunset?.[i] ?? "",
          uvIndexMax: data.daily.uv_index_max?.[i] ?? 0,
          precipProbabilityMax: data.daily.precipitation_probability_max?.[i] ?? 0,
        })),
        temperatureUnit: data.current_units?.temperature_2m ?? "°C",
      });
    } catch {
      console.error("Failed to fetch weather");
    } finally {
      setLoading(false);
    }
  }, [lat, lon]);

  useEffect(() => {
    fetchWeather();
    if (lat === null || lon === null) return;
    const interval = setInterval(fetchWeather, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchWeather, lat, lon]);

  return { weather, loading };
}

export function useRadar() {
  const [radar, setRadar] = useState<RadarData | null>(null);

  const fetchRadar = useCallback(async () => {
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) return;
      const data = await res.json();
      setRadar({
        host: data.host,
        frames: data.radar?.past ?? [],
      });
    } catch {
      // Silently fail — radar is optional
    }
  }, []);

  useEffect(() => {
    fetchRadar();
    const interval = setInterval(fetchRadar, RADAR_POLL);
    return () => clearInterval(interval);
  }, [fetchRadar]);

  return radar;
}
