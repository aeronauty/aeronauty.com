"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Music,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Search,
  Loader2,
  LogIn,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";

// MusicKit types (subset)
interface MKMediaItem {
  title: string;
  artistName: string;
  albumName: string;
  artworkURL?: string;
  artwork?: { url: string };
}

// MusicKit JS v3 instance — loosely typed due to no TS definitions
type MKInstance = Record<string, unknown> & {
  authorize: () => Promise<string>;
  unauthorize: () => Promise<void>;
  isAuthorized: boolean;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  skipToNextItem: () => Promise<void>;
  skipToPreviousItem: () => Promise<void>;
  setQueue: (opts: Record<string, unknown>) => Promise<void>;
  nowPlayingItem: MKMediaItem | null;
  playbackState: number;
  volume: number;
  addEventListener: (event: string, cb: () => void) => void;
  removeEventListener: (event: string, cb: () => void) => void;
};

interface MKSearchResult {
  id: string;
  type?: string;
  attributes: {
    name: string;
    artistName?: string;
    albumName?: string;
    artwork?: { url: string; width: number; height: number };
    durationInMillis?: number;
  };
}

declare global {
  interface Window {
    MusicKit: {
      configure: (config: { developerToken: string; app: { name: string; build: string } }) => Promise<MKInstance>;
      getInstance: () => MKInstance;
      PlaybackStates: Record<string, number>;
    };
  }
}

// --- Profile management ---
interface MusicProfile {
  id: string;
  name: string;
  icon: string;
  userToken: string;
}

const PROFILES_KEY = "aeronauty-music-profiles";
const ACTIVE_PROFILE_KEY = "aeronauty-music-active-profile";
const PROFILE_ICONS = ["👤", "👩", "👨", "👧", "👦", "🎵", "🎸", "🎹", "🎤", "🎧"];

function loadProfiles(): MusicProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: MusicProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function setActiveProfileId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  else localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

// --- Helpers ---
function getArtworkUrl(item: MKMediaItem | MKSearchResult, size = 200): string {
  const a = item as MKMediaItem & MKSearchResult;
  if (a.attributes?.artwork?.url) {
    return a.attributes.artwork.url.replace("{w}", String(size)).replace("{h}", String(size));
  }
  if (a.artwork?.url) {
    return a.artwork.url.replace("{w}", String(size)).replace("{h}", String(size));
  }
  if (a.artworkURL) {
    return a.artworkURL.replace("{w}", String(size)).replace("{h}", String(size));
  }
  return "";
}

type MusicTab = "library" | "search";

async function appleMusic(path: string, music: MKInstance): Promise<Record<string, unknown>> {
  const devToken = String(music.developerToken || music._developerToken || "");
  const userToken = String(music.musicUserToken || music._musicUserToken || "");
  const url = path.startsWith("http") ? path : `https://api.music.apple.com${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${devToken}`,
      "Music-User-Token": userToken,
    },
  });
  if (!res.ok) throw new Error(`Apple Music API ${res.status}`);
  return res.json();
}

export default function MusicWidget() {
  const [music, setMusic] = useState<MKInstance | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<MKMediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<MusicTab>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MKSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [libraryItems, setLibraryItems] = useState<MKSearchResult[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Profile state
  const [profiles, setProfiles] = useState<MusicProfile[]>([]);
  const [activeProfileId, setActiveProfile] = useState<string | null>(null);
  const [addingProfile, setAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileIcon, setNewProfileIcon] = useState("👤");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [managingProfiles, setManagingProfiles] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const scriptLoadedRef = useRef(false);

  // Load saved profiles on mount
  useEffect(() => {
    setProfiles(loadProfiles());
    setActiveProfile(getActiveProfileId());
  }, []);

  // Load MusicKit JS and configure
  useEffect(() => {
    if (scriptLoadedRef.current) return;
    scriptLoadedRef.current = true;

    const init = async () => {
      try {
        const res = await fetch("/api/musickit-token");
        if (!res.ok) {
          const data = await res.json();
          setConfigError(data.error || "Apple Music not configured");
          setLoading(false);
          return;
        }
        const { token } = await res.json();

        if (!window.MusicKit) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load MusicKit JS"));
            document.head.appendChild(script);
          });

          await new Promise<void>((resolve) => {
            const check = () => {
              if (window.MusicKit) resolve();
              else setTimeout(check, 100);
            };
            check();
          });
        }

        const instance = await window.MusicKit.configure({
          developerToken: token,
          app: { name: "Aeronauty Dashboard", build: "1.0.0" },
        });

        setMusic(instance);
        setLoading(false);

        // Auto-restore active profile
        const savedId = getActiveProfileId();
        const saved = loadProfiles();
        if (savedId && saved.length > 0) {
          const profile = saved.find((p) => p.id === savedId);
          if (profile) {
            try {
              instance.musicUserToken = profile.userToken;
              // Test if the token is still valid
              const testRes = await fetch("https://api.music.apple.com/v1/me/library/playlists?limit=1", {
                headers: {
                  Authorization: `Bearer ${instance.developerToken || instance._developerToken}`,
                  "Music-User-Token": profile.userToken,
                },
              });
              if (testRes.ok) {
                setAuthorized(true);
              } else {
                // Token expired — remove profile
                const updated = saved.filter((p) => p.id !== savedId);
                saveProfiles(updated);
                setProfiles(updated);
                setActiveProfileId(null);
                setActiveProfile(null);
              }
            } catch {
              // Token probably expired
            }
          }
        } else {
          setAuthorized(instance.isAuthorized);
        }
      } catch (err) {
        console.error("MusicKit init error:", err);
        setConfigError("Failed to initialize Apple Music");
        setLoading(false);
      }
    };

    init();
  }, []);

  // Listen for playback changes
  useEffect(() => {
    if (!music) return;

    const handlePlaybackChange = () => {
      setNowPlaying(music.nowPlayingItem);
      setIsPlaying(music.playbackState === 2);
    };

    music.addEventListener("playbackStateDidChange", handlePlaybackChange);
    music.addEventListener("nowPlayingItemDidChange", handlePlaybackChange);

    return () => {
      music.removeEventListener("playbackStateDidChange", handlePlaybackChange);
      music.removeEventListener("nowPlayingItemDidChange", handlePlaybackChange);
    };
  }, [music]);

  // Load library content when authorized
  useEffect(() => {
    if (!music || !authorized) return;
    const loadLibrary = async () => {
      setLibraryLoading(true);
      try {
        const [recentRes, playlistRes] = await Promise.allSettled([
          appleMusic("/v1/me/recent/played?limit=10", music),
          appleMusic("/v1/me/library/playlists?limit=20", music),
        ]);

        const items: MKSearchResult[] = [];

        if (playlistRes.status === "fulfilled") {
          const playlists = (playlistRes.value as Record<string, unknown[]>).data ?? [];
          for (const p of playlists) {
            const pl = p as MKSearchResult;
            if (pl.attributes) items.push({ ...pl, type: "playlist" });
          }
        }

        if (recentRes.status === "fulfilled") {
          const recent = (recentRes.value as Record<string, unknown[]>).data ?? [];
          for (const r of recent) {
            const item = r as MKSearchResult;
            if (item.attributes) items.push(item);
          }
        }

        setLibraryItems(items);
      } catch (err) {
        console.error("Library load error:", err);
      } finally {
        setLibraryLoading(false);
      }
    };
    loadLibrary();
  }, [music, authorized, activeProfileId]);

  // --- Profile actions ---
  const handleAddProfile = useCallback(async () => {
    if (!music) return;
    setAddingProfile(true);
    try {
      // Stop any current playback
      try { music.stop(); } catch { /* ignore */ }
      // Sign out first if someone is signed in
      if (authorized) {
        await music.unauthorize();
        setAuthorized(false);
        setNowPlaying(null);
        setIsPlaying(false);
        setLibraryItems([]);
      }
      // Prompt Apple ID sign-in
      await music.authorize();

      // Grab the user token
      const userToken = String(music.musicUserToken || music._musicUserToken || "");
      if (!userToken) throw new Error("No user token received");

      const profile: MusicProfile = {
        id: crypto.randomUUID(),
        name: newProfileName.trim() || `User ${profiles.length + 1}`,
        icon: newProfileIcon,
        userToken,
      };

      const updated = [...profiles, profile];
      saveProfiles(updated);
      setProfiles(updated);
      setActiveProfile(profile.id);
      setActiveProfileId(profile.id);
      setAuthorized(true);
      setNewProfileName("");
      setNewProfileIcon("👤");
      setManagingProfiles(false);
    } catch (err) {
      console.error("Add profile error:", err);
    } finally {
      setAddingProfile(false);
    }
  }, [music, authorized, profiles, newProfileName, newProfileIcon]);

  const switchToProfile = useCallback(async (profile: MusicProfile) => {
    if (!music || activeProfileId === profile.id) return;
    try {
      // Stop current playback
      try { music.stop(); } catch { /* ignore */ }
      setNowPlaying(null);
      setIsPlaying(false);
      setLibraryItems([]);

      // Set the stored user token directly
      music.musicUserToken = profile.userToken;

      // Test if valid
      const testRes = await fetch("https://api.music.apple.com/v1/me/library/playlists?limit=1", {
        headers: {
          Authorization: `Bearer ${music.developerToken || music._developerToken}`,
          "Music-User-Token": profile.userToken,
        },
      });

      if (testRes.ok) {
        setActiveProfile(profile.id);
        setActiveProfileId(profile.id);
        setAuthorized(true);
      } else {
        // Token expired — need to re-auth
        await music.unauthorize();
        await music.authorize();
        const newToken = String(music.musicUserToken || music._musicUserToken || "");
        if (newToken) {
          // Update stored token
          const updated = profiles.map((p) =>
            p.id === profile.id ? { ...p, userToken: newToken } : p
          );
          saveProfiles(updated);
          setProfiles(updated);
          setActiveProfile(profile.id);
          setActiveProfileId(profile.id);
          setAuthorized(true);
        }
      }
    } catch (err) {
      console.error("Switch profile error:", err);
    }
  }, [music, activeProfileId, profiles]);

  const removeProfile = useCallback((profileId: string) => {
    const updated = profiles.filter((p) => p.id !== profileId);
    saveProfiles(updated);
    setProfiles(updated);
    if (activeProfileId === profileId) {
      setActiveProfile(null);
      setActiveProfileId(null);
      setAuthorized(false);
      setLibraryItems([]);
      setNowPlaying(null);
    }
  }, [profiles, activeProfileId]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!query.trim() || !music) {
        setSearchResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const storefront = music.storefrontId || music.storefrontCountryCode || "us";
          const data = await appleMusic(
            `/v1/catalog/${storefront}/search?term=${encodeURIComponent(query)}&types=songs&limit=8`,
            music
          );
          const results = data as { results?: { songs?: { data: MKSearchResult[] } } };
          setSearchResults(results.results?.songs?.data ?? []);
        } catch (err) {
          console.error("Search error:", err);
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 400);
    },
    [music]
  );

  const playItem = useCallback(
    async (item: MKSearchResult) => {
      if (!music) return;
      try {
        const type = item.type ?? "songs";
        if (type === "playlists" || type === "playlist") {
          await music.setQueue({ playlist: item.id });
        } else if (type === "albums") {
          await music.setQueue({ album: item.id });
        } else {
          await music.setQueue({ song: item.id });
        }
        await music.play();
        setActiveTab("library");
        setSearchQuery("");
        setSearchResults([]);
      } catch (err) {
        console.error("Play error:", err);
      }
    },
    [music]
  );

  const artworkUrl = nowPlaying ? getArtworkUrl(nowPlaying, 300) : "";
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  // --- Render ---
  if (configError) {
    return (
      <div className="h-full bg-gray-900 rounded-2xl p-4 flex flex-col">
        <div className="drag-handle cursor-grab flex items-center gap-2 mb-3">
          <Music className="w-5 h-5 text-pink-400" />
          <h2 className="text-sm font-semibold">Music</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <AlertCircle className="w-8 h-8 text-gray-600" />
          <p className="text-xs text-gray-500 max-w-[200px]">
            Set APPLE_MUSIC_KEY_ID, APPLE_TEAM_ID, and APPLE_MUSIC_PRIVATE_KEY to enable.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full bg-gray-900 rounded-2xl p-4 flex flex-col">
        <div className="drag-handle cursor-grab flex items-center gap-2 mb-3">
          <Music className="w-5 h-5 text-pink-400" />
          <h2 className="text-sm font-semibold">Music</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-900 rounded-2xl p-4 flex flex-col overflow-hidden">
      {/* Header with profile avatars */}
      <div className="drag-handle cursor-grab flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-pink-400" />
          <h2 className="text-sm font-semibold">Music</h2>
        </div>

        {/* Profile switcher icons */}
        <div className="flex items-center gap-1">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => switchToProfile(p)}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm touch-manipulation transition-all ${
                p.id === activeProfileId
                  ? "bg-pink-600 ring-2 ring-pink-400 scale-110"
                  : "bg-gray-700/60 hover:bg-gray-600/60 opacity-60 hover:opacity-100"
              }`}
              title={p.name}
            >
              {p.icon}
            </button>
          ))}
          <button
            onClick={() => setManagingProfiles(!managingProfiles)}
            className="w-7 h-7 rounded-full bg-gray-800/60 hover:bg-gray-700/60 flex items-center justify-center touch-manipulation"
            title="Add profile"
          >
            <Plus className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Manage profiles panel */}
      {managingProfiles && (
        <div className="mb-2 p-2.5 bg-gray-800/60 rounded-xl space-y-2">
          <p className="text-xs text-gray-400 font-medium">Profiles</p>
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{p.icon}</span>
                <span className="text-xs">{p.name}</span>
              </div>
              <button
                onClick={() => removeProfile(p.id)}
                className="p-1 rounded hover:bg-red-900/30 touch-manipulation"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1 border-t border-gray-700">
            <button
              onClick={() => setShowIconPicker(!showIconPicker)}
              className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-sm touch-manipulation"
            >
              {newProfileIcon}
            </button>
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Name..."
              className="flex-1 bg-gray-700 rounded-lg px-2 py-1 text-xs border border-gray-600 focus:border-pink-500 focus:outline-none"
            />
            <button
              onClick={handleAddProfile}
              disabled={addingProfile}
              className="px-2.5 py-1 bg-pink-600 hover:bg-pink-500 rounded-lg text-xs font-medium touch-manipulation disabled:opacity-50"
            >
              {addingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sign in"}
            </button>
          </div>
          {showIconPicker && (
            <div className="flex flex-wrap gap-1 pt-1">
              {PROFILE_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => { setNewProfileIcon(icon); setShowIconPicker(false); }}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm touch-manipulation ${
                    newProfileIcon === icon ? "bg-pink-600" : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Not authorized — no profiles yet */}
      {!authorized && profiles.length === 0 && !managingProfiles && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <button
            onClick={() => setManagingProfiles(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-500 rounded-xl text-sm font-medium touch-manipulation transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Add Apple Music Profile
          </button>
          <p className="text-xs text-gray-500 text-center">
            Requires an Apple Music subscription
          </p>
        </div>
      )}

      {/* Not authorized but has profiles — prompt to pick one */}
      {!authorized && profiles.length > 0 && !managingProfiles && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-xs text-gray-400">Tap a profile above to start listening</p>
        </div>
      )}

      {/* Authorized content */}
      {authorized && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Now playing bar */}
          <div className="flex items-center gap-2 mb-2 p-2 bg-gray-800/40 rounded-xl">
            {nowPlaying && artworkUrl ? (
              <img src={artworkUrl} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {nowPlaying ? (
                <>
                  <p className="text-xs font-medium truncate">{nowPlaying.title}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {nowPlaying.artistName}
                    {activeProfile && <span className="ml-1 opacity-50">· {activeProfile.icon}</span>}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Nothing playing{activeProfile ? ` · ${activeProfile.name}` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => music?.skipToPreviousItem()}
                className="p-1.5 rounded-full hover:bg-gray-700 touch-manipulation"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (isPlaying ? music?.pause() : music?.play())}
                className="p-2 bg-pink-600 hover:bg-pink-500 rounded-full touch-manipulation"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <button
                onClick={() => music?.skipToNextItem()}
                className="p-1.5 rounded-full hover:bg-gray-700 touch-manipulation"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setActiveTab("library")}
              className={`px-2.5 py-1 text-xs rounded-lg touch-manipulation ${
                activeTab === "library" ? "bg-pink-600 text-white" : "bg-gray-800/60 text-gray-400"
              }`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`px-2.5 py-1 text-xs rounded-lg touch-manipulation ${
                activeTab === "search" ? "bg-pink-600 text-white" : "bg-gray-800/60 text-gray-400"
              }`}
            >
              Search
            </button>
          </div>

          {/* Search tab */}
          {activeTab === "search" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search songs..."
                  className="w-full bg-gray-800 rounded-lg pl-8 pr-3 py-2 text-sm border border-gray-700 focus:border-pink-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
                {searching && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  </div>
                )}
                {searchResults.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => playItem(song)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-800/80 touch-manipulation text-left"
                  >
                    {getArtworkUrl(song, 80) ? (
                      <img src={getArtworkUrl(song, 80)} alt="" className="w-10 h-10 rounded-md flex-shrink-0 bg-gray-800" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{song.attributes.name}</p>
                      <p className="text-xs text-gray-400 truncate">{song.attributes.artistName}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Library tab */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
              {libraryLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                </div>
              )}
              {!libraryLoading && libraryItems.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">
                  Your playlists and recently played will appear here.
                </p>
              )}
              {libraryItems.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => playItem(item)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-800/80 touch-manipulation text-left"
                >
                  {getArtworkUrl(item, 80) ? (
                    <img src={getArtworkUrl(item, 80)} alt="" className="w-10 h-10 rounded-md flex-shrink-0 bg-gray-800" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Music className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{item.attributes.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {item.type === "playlists" || item.type === "playlist"
                        ? "Playlist"
                        : item.attributes.artistName ?? ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
