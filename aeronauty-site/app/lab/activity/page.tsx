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

  useEffect(() => {
    fetch("/api/activity/recent?limit=200")
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((body) => setEvents(body.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-gray-400 hover:text-white">
            Sign out
          </a>
        </div>

        <h1 className="text-4xl font-bold tracking-tight">Activity</h1>
        <p className="mt-4 text-gray-400">Recent first-party activity events.</p>

        <div className="mt-10 overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {events.map((event) => (
                <tr key={event.id} className="bg-gray-950/60">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{event.email ?? "anonymous"}</td>
                  <td className="px-4 py-3 text-gray-300">{event.eventType}</td>
                  <td className="px-4 py-3 text-blue-200">{event.path ?? ""}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {[event.city, event.region, event.country].filter(Boolean).join(", ") || "unknown"}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No activity recorded yet.
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
