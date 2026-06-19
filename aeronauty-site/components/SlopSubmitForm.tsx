"use client";

import { FormEvent, useRef, useState } from "react";
import { X } from "lucide-react";
import { SLOP_CATEGORIES, SLOP_CATEGORY_LABELS, type SlopCategory } from "@/lib/slop-shared";

type Status = "idle" | "sending" | "sent" | "error";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export default function SlopSubmitForm() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<SlopCategory>("ai-slop");
  const [reason, setReason] = useState("");
  const [credit, setCredit] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(selected: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setErrorMessage("Screenshot must be under 4 MB.");
      setStatus("error");
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setStatus("idle");
  }

  function clearFile() {
    handleFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    try {
      const body = new FormData();
      body.set("url", url);
      body.set("category", category);
      body.set("reason", reason);
      body.set("credit", credit);
      if (file) body.set("screenshot", file);

      const response = await fetch("/api/slop/submit", { method: "POST", body });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorMessage(data.error ?? "Something went wrong. Try again.");
        setStatus("error");
        return;
      }

      setStatus("sent");
      setUrl("");
      setReason("");
      setCredit("");
      clearFile();
    } catch {
      setErrorMessage("Network error. Try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-md border border-teal-700/25 bg-teal-700/10 p-6 text-teal-900">
        <p className="font-semibold">In the pile. 🫡</p>
        <p className="mt-2 text-sm leading-6">
          It lands in the review queue — nothing goes public until I&apos;ve looked at it. Spot
          another one?
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 rounded-full border border-teal-700/30 px-4 py-2 text-sm font-semibold transition hover:bg-teal-700/10"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Link to the slop</span>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          placeholder="https://..."
          className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
        />
        <span className="mt-1 block text-xs text-stone-400">
          I&apos;ll try to pull a preview automatically — but a screenshot is the reliable record,
          especially for LinkedIn and X.
        </span>
      </label>

      <fieldset>
        <span className="text-sm font-medium text-stone-700">Category</span>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {SLOP_CATEGORIES.map((value) => {
            const selected = category === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                aria-pressed={selected}
                className={`rounded-md border px-4 py-3 text-sm font-semibold transition ${
                  selected
                    ? "border-[var(--accent)] bg-teal-700/10 text-teal-900"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                }`}
              >
                {SLOP_CATEGORY_LABELS[value]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="block">
        <span className="text-sm font-medium text-stone-700">
          Screenshot <span className="font-normal text-stone-400">(optional, under 4 MB)</span>
        </span>
        {previewUrl ? (
          <div className="mt-2 overflow-hidden rounded-md border border-stone-300 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Screenshot preview" className="max-h-72 w-full object-contain" />
            <button
              type="button"
              onClick={clearFile}
              className="flex w-full items-center justify-center gap-1 border-t border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50 hover:text-red-700"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : (
          <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500 transition hover:border-stone-400 hover:text-stone-700">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
            Click to attach a screenshot
          </label>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-stone-700">Comments — what&apos;s wrong with it?</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={600}
          rows={4}
          placeholder="The claim, and why it's nonsense. Be specific — this is half the script."
          className="mt-2 w-full resize-none rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
        />
        <span className="mt-1 block text-right text-xs text-stone-400">{reason.length}/600</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-stone-700">
          Your name / handle <span className="font-normal text-stone-400">(optional)</span>
        </span>
        <input
          type="text"
          value={credit}
          onChange={(event) => setCredit(event.target.value)}
          maxLength={80}
          placeholder="So I can credit the find"
          className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
        />
      </label>

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-full bg-stone-950 px-4 py-3 font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Submitting..." : "Submit to the pile"}
      </button>

      {status === "error" && (
        <p className="rounded-md border border-red-700/25 bg-red-700/10 p-4 text-sm text-red-900">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
