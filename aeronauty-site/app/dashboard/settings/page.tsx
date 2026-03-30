"use client";

import { useState, useEffect, Suspense } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Plus, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface GoogleAccount {
  email: string;
  name?: string;
  picture?: string;
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
  const appleConfigured = !!(
    typeof process !== "undefined"
      ? false // can't read env on client — check via a different signal
      : false
  );

  useEffect(() => {
    fetch("/api/google-accounts")
      .then((r) => r.json())
      .then((data) => {
        setGoogleAccounts(Array.isArray(data) ? data : []);
        setLoadingAccounts(false);
      })
      .catch(() => setLoadingAccounts(false));
  }, [justConnected]);

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

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
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

