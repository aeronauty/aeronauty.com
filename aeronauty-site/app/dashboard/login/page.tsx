"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const result = await signIn("credentials", {
      password,
      redirect: false,
    });

    if (result?.ok) {
      router.push("/dashboard");
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-2 text-gray-400">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`
              w-full bg-gray-800 rounded-xl px-5 py-4 text-xl text-center tracking-widest
              outline-none focus:ring-2 transition-all border border-gray-700
              ${error ? "focus:ring-red-500 ring-1 ring-red-500/50" : "focus:ring-blue-500"}
            `}
            autoFocus
            autoComplete="current-password"
          />

          {error && (
            <p className="text-red-400 text-sm">Incorrect password</p>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 rounded-xl font-medium text-lg transition-colors touch-manipulation"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
