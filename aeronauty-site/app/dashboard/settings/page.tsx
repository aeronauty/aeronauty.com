"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Plus, Trash2, Loader2, MapPin, Search, X, Eye, EyeOff, Pencil, Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDashboardStore, type BackgroundTheme } from "@/lib/dashboard-store";
import type { CalendarInfo } from "@/lib/types";

const BACKGROUND_THEMES: { key: BackgroundTheme; label: string; preview: string }[] = [
  { key: "nature", label: "Nature", preview: "url(https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200&q=60)" },
  { key: "classic", label: "Classic Art", preview: "url(https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=200&q=60)" },
  { key: "space", label: "Cosmos", preview: "url(https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=200&q=60)" },
  { key: "architecture", label: "Architecture", preview: "url(https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=200&q=60)" },
  { key: "moody", label: "Moody", preview: "url(https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=200&q=60)" },
  { key: "none", label: "None", preview: "linear-gradient(135deg, #030712, #111827)" },
  { key: "custom", label: "Photo Album", preview: "none" },
];

interface GoogleAccount {
  email: string;
  name?: string;
  picture?: string;
}

interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected") === "1";
  const connectError = searchParams.get("error");

  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  // Background settings
  const backgroundTheme = useDashboardStore((s) => s.backgroundTheme);
  const setBackgroundTheme = useDashboardStore((s) => s.setBackgroundTheme);
  const albumUrl = useDashboardStore((s) => s.albumUrl);
  const setAlbumUrl = useDashboardStore((s) => s.setAlbumUrl);
  const [photoInput, setPhotoInput] = useState(albumUrl ?? "");
  const [photoTesting, setPhotoTesting] = useState(false);
  const [photoTestResult, setPhotoTestResult] = useState<string | null>(null);

  // Calendar settings
  const hiddenCalendarIds = useDashboardStore((s) => s.hiddenCalendarIds);
  const setHiddenCalendarIds = useDashboardStore((s) => s.setHiddenCalendarIds);
  const calendarNicknames = useDashboardStore((s) => s.calendarNicknames);
  const setCalendarNickname = useDashboardStore((s) => s.setCalendarNickname);
  const removeCalendarNickname = useDashboardStore((s) => s.removeCalendarNickname);
  const [allCalendars, setAllCalendars] = useState<CalendarInfo[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");

  // Weather settings
  const weatherLocation = useDashboardStore((s) => s.weatherLocation);
  const setWeatherLocation = useDashboardStore((s) => s.setWeatherLocation);
  const [cityQuery, setCityQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetch("/api/google-accounts")
      .then((r) => r.json())
      .then((data) => {
        setGoogleAccounts(Array.isArray(data) ? data : []);
        setLoadingAccounts(false);
      })
      .catch(() => setLoadingAccounts(false));
  }, [justConnected]);

  useEffect(() => {
    fetch("/api/calendars?action=calendars")
      .then((r) => r.json())
      .then((data) => {
        setAllCalendars(Array.isArray(data) ? data : []);
        setLoadingCalendars(false);
      })
      .catch(() => setLoadingCalendars(false));
  }, [googleAccounts]);

  const removeAccount = async (email: string) => {
    setRemovingEmail(email);
    await fetch("/api/google-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setGoogleAccounts((prev) => prev.filter((a) => a.email !== email));
    setRemovingEmail(null);
  };

  const testPhotos = async () => {
    if (!photoInput) return;
    setPhotoTesting(true);
    setPhotoTestResult(null);
    try {
      const res = await fetch(`/api/photos?url=${encodeURIComponent(photoInput)}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setPhotoTestResult(`Found ${data.length} photos`);
        setAlbumUrl(photoInput);
      } else {
        setPhotoTestResult("No photos found in album");
      }
    } catch {
      setPhotoTestResult("Failed to load album");
    } finally {
      setPhotoTesting(false);
    }
  };

  const handleCitySearch = (q: string) => {
    setCityQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setGeoResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setGeoLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setGeoResults(Array.isArray(data) ? data : []);
      } catch {
        setGeoResults([]);
      } finally {
        setGeoLoading(false);
      }
    }, 400);
  };

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Reverse geocode to get name
        try {
          const res = await fetch(`/api/geocode?q=${latitude},${longitude}`);
          const data = await res.json();
          const name = data[0]?.name ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
          setWeatherLocation({ lat: latitude, lon: longitude, name });
        } catch {
          setWeatherLocation({
            lat: latitude,
            lon: longitude,
            name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
          });
        }
      },
      () => alert("Could not get your location. Please search for a city instead.")
    );
  };

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto relative z-10">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="p-2.5 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {justConnected && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-green-900/30 border border-green-700/50 rounded-xl text-green-300">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          Google account connected successfully.
        </div>
      )}

      {connectError && (
        <div className="mb-6 flex items-center gap-2 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-300">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          Failed to connect: {connectError}. Please try again.
        </div>
      )}

      {/* Background */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Background</h2>
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {BACKGROUND_THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => setBackgroundTheme(t.key)}
                className={`relative rounded-xl overflow-hidden h-16 transition-all touch-manipulation ${
                  backgroundTheme === t.key
                    ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900"
                    : "hover:ring-1 hover:ring-gray-600"
                }`}
                style={{
                  background: t.key === "custom" ? "#1f2937" : t.preview.startsWith("url(") ? `${t.preview} center/cover no-repeat` : t.preview,
                }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
                  {t.label}
                </span>
              </button>
            ))}
          </div>

          {backgroundTheme === "custom" && (
            <div className="space-y-2 pt-2 border-t border-gray-800">
              <p className="text-sm text-gray-400">
                Enter an iCloud Shared Album URL to cycle photos.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={photoInput}
                  onChange={(e) => setPhotoInput(e.target.value)}
                  placeholder="https://www.icloud.com/sharedalbum/#B..."
                  className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={testPhotos}
                  disabled={photoTesting || !photoInput}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm touch-manipulation"
                >
                  {photoTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test & Save"}
                </button>
              </div>
              {photoTestResult && (
                <p className={`text-sm ${photoTestResult.includes("Found") ? "text-green-400" : "text-red-400"}`}>
                  {photoTestResult}
                </p>
              )}
              {albumUrl && (
                <button
                  onClick={() => {
                    setAlbumUrl(null);
                    setPhotoInput("");
                    setPhotoTestResult(null);
                  }}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Clear album
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Weather Location */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Weather Location</h2>
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          {weatherLocation && (
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span className="text-sm">{weatherLocation.name}</span>
              </div>
              <button
                onClick={() => setWeatherLocation(null)}
                className="p-1.5 rounded-lg hover:bg-red-900/50"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => handleCitySearch(e.target.value)}
              placeholder="Search for a city..."
              className="w-full bg-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
          {geoLoading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching...
            </div>
          )}
          {geoResults.length > 0 && (
            <div className="space-y-1">
              {geoResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setWeatherLocation({ lat: r.lat, lon: r.lon, name: `${r.name}${r.admin1 ? `, ${r.admin1}` : ""}${r.country ? `, ${r.country}` : ""}` });
                    setCityQuery("");
                    setGeoResults([]);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-gray-800 text-sm touch-manipulation"
                >
                  {r.name}{r.admin1 ? `, ${r.admin1}` : ""}{r.country ? `, ${r.country}` : ""}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={useMyLocation}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 touch-manipulation"
          >
            <MapPin className="w-4 h-4" />
            Use my location
          </button>
        </div>
      </section>

      {/* Calendars */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Calendars</h2>
        <div className="bg-gray-900 rounded-xl p-4 space-y-2">
          <p className="text-sm text-gray-400 mb-3">
            Toggle visibility and set nicknames for your calendars.
          </p>
          {loadingCalendars ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading calendars…</span>
            </div>
          ) : allCalendars.length === 0 ? (
            <p className="text-sm text-gray-500">No calendars found. Connect an account first.</p>
          ) : (
            allCalendars.map((cal) => {
              const isHidden = hiddenCalendarIds.includes(cal.id);
              const isEditing = editingNickname === cal.id;
              const nickname = calendarNicknames[cal.id];
              return (
                <div
                  key={cal.id}
                  className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={nicknameInput}
                          onChange={(e) => setNicknameInput(e.target.value)}
                          placeholder={cal.name}
                          className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (nicknameInput.trim()) {
                                setCalendarNickname(cal.id, nicknameInput.trim());
                              } else {
                                removeCalendarNickname(cal.id);
                              }
                              setEditingNickname(null);
                            } else if (e.key === "Escape") {
                              setEditingNickname(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (nicknameInput.trim()) {
                              setCalendarNickname(cal.id, nicknameInput.trim());
                            } else {
                              removeCalendarNickname(cal.id);
                            }
                            setEditingNickname(null);
                          }}
                          className="p-1 rounded hover:bg-gray-600"
                        >
                          <Check className="w-4 h-4 text-green-400" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${isHidden ? "text-gray-500 line-through" : ""}`}>
                          {nickname || cal.name}
                        </span>
                        {nickname && (
                          <span className="text-xs text-gray-600 truncate">({cal.name})</span>
                        )}
                        <button
                          onClick={() => {
                            setEditingNickname(cal.id);
                            setNicknameInput(nickname || "");
                          }}
                          className="p-1 rounded hover:bg-gray-700 flex-shrink-0"
                        >
                          <Pencil className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    )}
                    <div className="text-xs text-gray-600 truncate">
                      {cal.source} · {cal.accountEmail || "Apple CalDAV"}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (isHidden) {
                        setHiddenCalendarIds(hiddenCalendarIds.filter((id) => id !== cal.id));
                      } else {
                        setHiddenCalendarIds([...hiddenCalendarIds, cal.id]);
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-gray-700 touch-manipulation flex-shrink-0"
                    title={isHidden ? "Show calendar" : "Hide calendar"}
                  >
                    {isHidden ? (
                      <EyeOff className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Google Accounts */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google Calendar Accounts
        </h2>

        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading accounts…</span>
            </div>
          ) : googleAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">No Google accounts connected yet.</p>
          ) : (
            googleAccounts.map((account) => (
              <div
                key={account.email}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl"
              >
                {account.picture ? (
                  <img src={account.picture} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                    {account.email[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {account.name && <div className="text-sm font-medium">{account.name}</div>}
                  <div className="text-sm text-gray-400 truncate">{account.email}</div>
                </div>
                <button
                  onClick={() => removeAccount(account.email)}
                  disabled={removingEmail === account.email}
                  className="p-2 rounded-lg hover:bg-red-900/50 touch-manipulation"
                >
                  {removingEmail === account.email ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <Trash2 className="w-4 h-4 text-red-400" />
                  )}
                </button>
              </div>
            ))
          )}

          <a
            href="/api/google-oauth"
            className="flex items-center justify-center gap-2 w-full p-3 rounded-xl border border-gray-700 hover:border-gray-500 hover:bg-gray-800/50 transition-colors text-sm touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            Connect a Google account
          </a>
        </div>
      </section>

      {/* Apple Calendar (CalDAV) */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-xl">🍎</span>
          Apple Calendar &amp; Reminders
        </h2>

        <div className="bg-gray-900 rounded-xl p-4 space-y-3 text-sm text-gray-300">
          <p>Apple Calendar and Reminders sync via CalDAV using an app-specific password.</p>

          <p className="font-medium text-white">Set these environment variables in Vercel:</p>
          <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs space-y-1">
            <div><span className="text-blue-400">APPLE_CALDAV_USERNAME</span>=you@icloud.com</div>
            <div><span className="text-blue-400">APPLE_CALDAV_PASSWORD</span>=xxxx-xxxx-xxxx-xxxx</div>
          </div>

          <p className="font-medium text-white">To generate an app-specific password:</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-400">
            <li>Go to <span className="text-blue-400">appleid.apple.com</span></li>
            <li>Sign In &amp; Security → App-Specific Passwords</li>
            <li>Click <strong>Generate</strong>, name it &quot;Dashboard&quot;</li>
            <li>Add the result as <code className="text-blue-400">APPLE_CALDAV_PASSWORD</code></li>
          </ol>
        </div>
      </section>

      {/* Apple Music */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-xl">🎵</span>
          Apple Music
        </h2>

        <div className="bg-gray-900 rounded-xl p-4 space-y-3 text-sm text-gray-300">
          <p>Play Apple Music directly from the dashboard. Requires an Apple Developer account and Apple Music subscription.</p>

          <p className="font-medium text-white">Set these environment variables:</p>
          <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs space-y-1">
            <div><span className="text-pink-400">APPLE_MUSIC_KEY_ID</span>=your 10-char key ID</div>
            <div><span className="text-pink-400">APPLE_TEAM_ID</span>=your 10-char team ID</div>
            <div><span className="text-pink-400">APPLE_MUSIC_PRIVATE_KEY</span>=contents of .p8 file</div>
          </div>

          <p className="font-medium text-white">To create a MusicKit key:</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-400">
            <li>Go to <span className="text-pink-400">developer.apple.com</span> → Certificates, Identifiers &amp; Profiles</li>
            <li>Register a new MusicKit Identifier (Media ID)</li>
            <li>Under Keys, create a new key with MusicKit enabled</li>
            <li>Download the .p8 file and note the Key ID</li>
            <li>Your Team ID is in the top-right of the Developer portal</li>
          </ol>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Storage</h2>
        <div className="bg-gray-900 rounded-xl p-4 text-sm text-gray-400 space-y-2">
          <p>
            Google account tokens are stored in{" "}
            <span className="text-white">Upstash Redis</span> when{" "}
            <code className="text-blue-400">UPSTASH_REDIS_REST_URL</code> and{" "}
            <code className="text-blue-400">UPSTASH_REDIS_REST_TOKEN</code> are set.
            Otherwise they&apos;re held in memory (lost on server restart).
          </p>
          <p>
            Set up Upstash via{" "}
            <span className="text-white">Vercel → Storage → Create Database → Upstash Redis</span>.
            The env vars are added automatically.
          </p>
        </div>
      </section>
    </div>
  );
}
