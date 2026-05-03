"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

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
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <Link href="/" className="mb-10 text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
          Aeronauty
        </Link>

        <p className="eyebrow">Private lab</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Lab access</h1>
        <p className="mt-4 leading-7 text-stone-600">
          Continue with Google or enter an approved email address and I{"'"}ll send you a sign-in link.
        </p>

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/lab" })}
          className="mt-8 w-full rounded-full border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-950 transition hover:border-stone-500"
        >
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-stone-400">
          <div className="h-px flex-1 bg-stone-300" />
          or
          <div className="h-px flex-1 bg-stone-300" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-stone-950 px-4 py-3 font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "sending" ? "Sending..." : "Send sign-in link"}
          </button>
        </form>

        {status === "sent" && (
          <p className="mt-5 rounded-md border border-teal-700/25 bg-teal-700/10 p-4 text-sm text-teal-900">
            If that email is approved, a sign-in link is on its way.
          </p>
        )}

        {status === "error" && (
          <p className="mt-5 rounded-md border border-red-700/25 bg-red-700/10 p-4 text-sm text-red-900">
            I couldn{"'"}t send the sign-in link. Check the email service configuration.
          </p>
        )}
      </div>
    </main>
  );
}
