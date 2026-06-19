"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { MessageSquare, X } from "lucide-react";
import { MAX_COMMENT_LEN, type SlopComment, type CommentViewer } from "@/lib/slop-shared";

function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function SlopComments({ submissionId }: { submissionId: string }) {
  const [comments, setComments] = useState<SlopComment[]>([]);
  const [viewer, setViewer] = useState<CommentViewer>({ signedIn: false, name: null, isOwner: false });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/slop/comments?submissionId=${encodeURIComponent(submissionId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setComments(Array.isArray(data.comments) ? data.comments : []);
        if (data.viewer) setViewer(data.viewer);
      }
    } finally {
      setLoaded(true);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError("");
    try {
      const res = await fetch("/api/slop/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, body, name: viewer.signedIn ? undefined : name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't post that.");
        return;
      }
      if (data.comment) setComments((current) => [data.comment, ...current]);
      if (data.viewer) setViewer(data.viewer);
      setBody("");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(commentId: string) {
    const res = await fetch("/api/slop/comment/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, commentId }),
    });
    if (res.ok) setComments((current) => current.filter((c) => c.id !== commentId));
  }

  const count = comments.length;

  return (
    <div className="mt-4 border-t border-stone-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-900"
      >
        <MessageSquare className="h-4 w-4" />
        {loaded ? `${count} comment${count === 1 ? "" : "s"}` : "Comments"}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {count > 0 && (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="group text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-700">
                      {c.authorName || "Anonymous"}
                    </span>
                    {c.isOwner && (
                      <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Owner
                      </span>
                    )}
                    {!c.isOwner && c.verified && (
                      <span className="text-xs text-stone-400" title="Signed-in account">
                        ✓
                      </span>
                    )}
                    <span className="text-xs text-stone-400">{timeAgo(c.createdAt)}</span>
                    {viewer.isOwner && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        aria-label="Delete comment"
                        className="ml-auto text-stone-300 transition hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words leading-6 text-stone-700">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handlePost} className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_COMMENT_LEN}
              rows={2}
              required
              placeholder="Add a comment…"
              className="w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
            />
            <div className="flex flex-wrap items-center gap-2">
              {viewer.signedIn ? (
                <span className="text-xs text-stone-500">
                  Commenting as <span className="font-semibold">{viewer.name || "you"}</span>
                  {viewer.isOwner && " (owner)"}
                </span>
              ) : (
                <>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder="Name (optional)"
                    className="w-40 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-950 outline-none transition focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => signIn("google", { callbackUrl: window.location.href })}
                    className="text-xs text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
                  >
                    or sign in with Google
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={posting || !body.trim()}
                className="ml-auto rounded-full bg-stone-950 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
