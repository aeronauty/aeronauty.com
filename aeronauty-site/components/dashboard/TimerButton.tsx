"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Timer, X, Plus, Minus, RotateCcw, Play, Pause, PlusCircle } from "lucide-react";

const PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
];

interface TimerState {
  id: string;
  name: string;
  remaining: number;
  initial: number;
  running: boolean;
}

let nextId = 1;

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TimerButton() {
  const [open, setOpen] = useState(false);
  const [timers, setTimers] = useState<TimerState[]>([]);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const playAlarm = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const playBeep = (time: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        osc.start(time);
        osc.stop(time + 0.3);
      };
      playBeep(ctx.currentTime);
      playBeep(ctx.currentTime + 0.4);
      playBeep(ctx.currentTime + 0.8);
    } catch {
      /* ignore */
    }
  }, []);

  // Single interval ticks all timers
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running && t.remaining > 0);
    if (!hasRunning) return;

    const interval = setInterval(() => {
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running || t.remaining <= 0) return t;
          if (t.remaining <= 1) {
            playAlarm();
            return { ...t, remaining: 0, running: false };
          }
          return { ...t, remaining: t.remaining - 1 };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timers, playAlarm]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const addTimer = (seconds: number, name?: string) => {
    const t: TimerState = {
      id: String(nextId++),
      name: name || `Timer ${timers.length + 1}`,
      remaining: seconds,
      initial: seconds,
      running: true,
    };
    setTimers((prev) => [...prev, t]);
    setNewName("");
    setNewTime(0);
    setShowCreate(false);
  };

  const togglePause = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id && t.remaining > 0 ? { ...t, running: !t.running } : t))
    );
  };

  const resetTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, remaining: t.initial, running: false } : t))
    );
  };

  const removeTimer = (id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  };

  const adjustTimer = (id: string, delta: number) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, remaining: Math.max(0, t.remaining + delta), initial: Math.max(0, t.initial + delta) }
          : t
      )
    );
  };

  const renameTimer = (id: string, name: string) => {
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    setEditingName(null);
  };

  const activeCount = timers.filter((t) => t.running).length;
  const doneCount = timers.filter((t) => t.initial > 0 && t.remaining === 0 && !t.running).length;
  const anyDone = doneCount > 0;
  const anyActive = activeCount > 0 || anyDone;

  // For badge: show nearest-to-done timer
  const nearestTimer = timers
    .filter((t) => t.running && t.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)[0];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Header button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`p-2.5 rounded-lg touch-manipulation transition-colors relative ${
          anyDone
            ? "bg-red-600/30 hover:bg-red-600/50 animate-pulse"
            : anyActive
              ? "bg-blue-600/30 hover:bg-blue-600/50"
              : "hover:bg-gray-800 active:bg-gray-700"
        }`}
        title="Timers"
      >
        <Timer className={`w-5 h-5 ${anyDone ? "text-red-400" : anyActive ? "text-blue-400" : ""}`} />
        {anyActive && timers.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-600 rounded-full text-[9px] font-bold flex items-center justify-center">
            {timers.length}
          </span>
        )}
        {nearestTimer && !open && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-blue-300 bg-gray-900/90 px-1 rounded whitespace-nowrap">
            {formatTime(nearestTimer.remaining)}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900/95 backdrop-blur-lg border border-gray-700/50 rounded-2xl p-3 shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
          {/* Active timers list */}
          {timers.length > 0 && (
            <div className="space-y-2 mb-3">
              {timers.map((t) => {
                const isDone = t.initial > 0 && t.remaining === 0 && !t.running;
                const progress = t.initial > 0 ? t.remaining / t.initial : 0;
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl p-2.5 ${
                      isDone ? "bg-red-900/30 ring-1 ring-red-500/50" : "bg-gray-800/60"
                    }`}
                  >
                    {/* Name row */}
                    <div className="flex items-center justify-between mb-1.5">
                      {editingName === t.id ? (
                        <input
                          autoFocus
                          defaultValue={t.name}
                          onBlur={(e) => renameTimer(t.id, e.target.value || t.name)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameTimer(t.id, (e.target as HTMLInputElement).value || t.name);
                          }}
                          className="bg-gray-700 rounded px-1.5 py-0.5 text-xs w-28 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingName(t.id)}
                          className="text-xs text-gray-400 hover:text-gray-200 truncate max-w-[140px]"
                          title="Click to rename"
                        >
                          {t.name}
                        </button>
                      )}
                      <button
                        onClick={() => removeTimer(t.id)}
                        className="p-0.5 rounded hover:bg-red-900/50 text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Progress bar + time */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${isDone ? "bg-red-500" : "bg-blue-500"}`}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                      <span className={`text-sm font-mono tabular-nums flex-shrink-0 ${isDone ? "text-red-400" : ""}`}>
                        {isDone ? "Done!" : formatTime(t.remaining)}
                      </span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => adjustTimer(t.id, -30)} className="p-1 rounded hover:bg-gray-700 touch-manipulation" title="-30s">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => togglePause(t.id)}
                        className={`p-1.5 rounded-full touch-manipulation ${
                          t.running ? "bg-amber-600 hover:bg-amber-500" : "bg-blue-600 hover:bg-blue-500"
                        }`}
                      >
                        {t.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-px" />}
                      </button>
                      <button onClick={() => adjustTimer(t.id, 30)} className="p-1 rounded hover:bg-gray-700 touch-manipulation" title="+30s">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => resetTimer(t.id)} className="p-1 rounded hover:bg-gray-700 touch-manipulation ml-1" title="Reset">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create new timer */}
          {showCreate ? (
            <div className="bg-gray-800/40 rounded-xl p-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Timer name (e.g. Pasta)"
                className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTime > 0) addTimer(newTime, newName || undefined);
                }}
              />
              {/* Presets */}
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => addTimer(p.seconds, newName || undefined)}
                    className="py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 active:bg-gray-600 touch-manipulation"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Custom */}
              <div className="flex items-center justify-between bg-gray-800/60 rounded-lg p-1.5">
                <button
                  onClick={() => setNewTime((t) => Math.max(0, t - 60))}
                  disabled={newTime <= 0}
                  className="p-1.5 rounded hover:bg-gray-700 touch-manipulation disabled:opacity-30"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-mono tabular-nums min-w-[5ch] text-center">{formatTime(newTime)}</span>
                <button
                  onClick={() => setNewTime((t) => t + 60)}
                  className="p-1.5 rounded hover:bg-gray-700 touch-manipulation"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                {newTime > 0 && (
                  <button
                    onClick={() => addTimer(newTime, newName || undefined)}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium touch-manipulation"
                  >
                    Start
                  </button>
                )}
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); setNewTime(0); }}
                  className="py-1.5 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-white bg-gray-800/40 hover:bg-gray-800/70 rounded-xl touch-manipulation transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              {timers.length === 0 ? "Start a timer" : "Add another timer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
