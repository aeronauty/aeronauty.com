"use client";

import { useState } from "react";
import { Plus, Eye, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { Post, PostStatus } from "@/lib/posts-shared";

const BLANK = { id: null as string | null, title: "", summary: "", tags: "", body: "" };

export default function PostComposer({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [form, setForm] = useState(BLANK);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<PostStatus | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function edit(post: Post) {
    setForm({
      id: post.id,
      title: post.title,
      summary: post.summary,
      tags: post.tags.join(", "),
      body: post.body,
    });
    setSavedSlug(post.slug);
    setSavedStatus(post.status);
    setPreview(false);
    setMessage("");
  }

  function startNew() {
    setForm(BLANK);
    setSavedSlug(null);
    setSavedStatus(null);
    setPreview(false);
    setMessage("");
  }

  async function save(status: PostStatus) {
    if (!form.title.trim() || !form.body.trim()) {
      setMessage("Title and body are required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: form.id,
          title: form.title,
          summary: form.summary,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          body: form.body,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.post) {
        setMessage(data.error ?? "Could not save.");
        return;
      }
      const post: Post = data.post;
      setPosts((current) => {
        const others = current.filter((p) => p.id !== post.id);
        return [post, ...others].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      });
      setForm((f) => ({ ...f, id: post.id }));
      setSavedSlug(post.slug);
      setSavedStatus(post.status);
      setMessage(status === "published" ? "Published ✓" : "Draft saved ✓");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        setPosts((current) => current.filter((p) => p.id !== id));
        if (form.id === id) startNew();
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15";

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <aside>
        <button
          type="button"
          onClick={startNew}
          className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          <Plus className="h-4 w-4" /> New post
        </button>
        <ul className="space-y-1">
          {posts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => edit(post)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                  form.id === post.id ? "bg-stone-200" : "hover:bg-stone-100"
                }`}
              >
                <span className="truncate">{post.title || "Untitled"}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    post.status === "published"
                      ? "bg-teal-700/10 text-teal-800"
                      : "bg-stone-200 text-stone-500"
                  }`}
                >
                  {post.status === "published" ? "Live" : "Draft"}
                </span>
              </button>
            </li>
          ))}
          {posts.length === 0 && <li className="px-3 py-2 text-sm text-stone-400">No posts yet.</li>}
        </ul>
      </aside>

      <section className="space-y-4">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          className={`${inputClass} text-lg font-semibold`}
        />
        <input
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="One-line summary (optional)"
          className={inputClass}
        />
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="Tags, comma separated (optional)"
          className={inputClass}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">Body (markdown)</span>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900"
            >
              {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <div className="min-h-[16rem] rounded-md border border-stone-200 bg-white p-5">
              {form.body.trim() ? (
                <Markdown>{form.body}</Markdown>
              ) : (
                <p className="text-stone-400">Nothing to preview.</p>
              )}
            </div>
          ) : (
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={16}
              placeholder={"Write in markdown…\n\n## A heading\n\nSome **bold** text and a [link](https://…)."}
              className={`${inputClass} resize-y font-mono text-sm leading-6`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => save("published")}
            className="rounded-full bg-stone-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
          >
            {savedStatus === "published" ? "Update (live)" : "Publish"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save("draft")}
            className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500 disabled:opacity-60"
          >
            Save draft
          </button>
          {form.id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(form.id as string)}
              className="inline-flex items-center gap-1 text-sm text-stone-400 transition hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {savedSlug && (
            <a
              href={`/posts/${savedSlug}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> /posts/{savedSlug}
            </a>
          )}
        </div>
        {message && <p className="text-sm text-stone-600">{message}</p>}
      </section>
    </div>
  );
}
