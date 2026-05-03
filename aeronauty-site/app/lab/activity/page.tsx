"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ActivityEvent = {
  id: string;
  eventType: string;
  path: string | null;
  pageTitle: string | null;
  email: string | null;
  authMethod: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  createdAt: string;
};

export default function LabActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [storeConfigured, setStoreConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/activity/recent?limit=200")
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((body) => {
        setEvents(body.events ?? []);
        setStoreConfigured(body.activityStoreConfigured ?? null);
      })
      .catch(() => {
        setEvents([]);
        setStoreConfigured(null);
      });
  }, []);

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>

        <p className="eyebrow">Lab</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-4 text-stone-600">Recent first-party activity events.</p>

        {storeConfigured === false && (
          <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Activity storage is not configured in this deployment. Add either
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">UPSTASH_REDIS_REST_URL</code>
            and
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">UPSTASH_REDIS_REST_TOKEN</code>
            , or the equivalent Vercel KV REST variables, then redeploy.
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-stone-100 text-stone-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{event.email ?? "anonymous"}</td>
                  <td className="px-4 py-3 text-stone-600">{event.eventType}</td>
                  <td className="px-4 py-3 text-[var(--accent)]">{event.path ?? ""}</td>
                  <td className="px-4 py-3 text-stone-500">
                    {[event.city, event.region, event.country].filter(Boolean).join(", ") || "unknown"}
                  </td>
                </tr>
              ))}
              {events.length === 0 && storeConfigured !== false && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
              {events.length === 0 && storeConfigured === false && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                    Activity storage is not configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
