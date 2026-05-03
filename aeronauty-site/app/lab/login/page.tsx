"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function LabLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const response = await fetch("/api/lab/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setStatus(response.ok ? "sent" : "error");
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <Link href="/" className="mb-10 text-sm font-semibold text-blue-300 hover:text-blue-200">
          Aeronauty
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Lab access</h1>
        <p className="mt-3 text-gray-400">
          Enter an approved email address and I{"'"}ll send you a sign-in link.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-lg bg-blue-500 px-4 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Sending..." : "Send sign-in link"}
          </button>
        </form>

        {status === "sent" && (
          <p className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            If that email is approved, a sign-in link is on its way.
          </p>
        )}

        {status === "error" && (
          <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            I couldn{"'"}t send the sign-in link. Check the email service configuration.
          </p>
        )}
      </div>
    </main>
  );
}
