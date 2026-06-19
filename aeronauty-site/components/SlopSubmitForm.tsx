"use client";

import { FormEvent, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { SLOP_CATEGORIES, SLOP_CATEGORY_LABELS, type SlopCategory } from "@/lib/slop-shared";

type Status = "idle" | "sending" | "sent" | "error";
type Attachment = { file: File; previewUrl: string };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

export default function SlopSubmitForm() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<SlopCategory>("ai-slop");
  const [reason, setReason] = useState("");
  const [credit, setCredit] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected);

    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      setErrorMessage(`Up to ${MAX_ATTACHMENTS} attachments.`);
      setStatus("error");
      return;
    }
    if (incoming.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setErrorMessage("Each attachment must be under 4 MB.");
      setStatus("error");
      return;
    }
    const existingTotal = attachments.reduce((sum, a) => sum + a.file.size, 0);
    const incomingTotal = incoming.reduce((sum, file) => sum + file.size, 0);
    if (existingTotal + incomingTotal > MAX_TOTAL_BYTES) {
      setErrorMessage("Attachments are too large together — keep the total under 4 MB.");
      setStatus("error");
      return;
    }

    setAttachments((current) => [
      ...current,
      ...incoming.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  function clearAttachments() {
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
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
      attachments.forEach((a) => body.append("screenshots", a.file));

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
      clearAttachments();
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

  const canAddMore = attachments.length < MAX_ATTACHMENTS;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Link to the slop</span>
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          placeholder="linkedin.com/posts/..."
          className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-700/15"
        />
        <span className="mt-1 block text-xs text-stone-400">
          Paste any link — I&apos;ll sort out the https:// for you. A screenshot is the reliable
          record, especially for LinkedIn and X.
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
          Screenshots{" "}
          <span className="font-normal text-stone-400">
            (optional, up to {MAX_ATTACHMENTS}, 4 MB total)
          </span>
        </span>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {attachments.map((attachment, index) => (
            <div
              key={attachment.previewUrl}
              className="group relative aspect-square overflow-hidden rounded-md border border-stone-300 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.previewUrl}
                alt={`Attachment ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                aria-label={`Remove attachment ${index + 1}`}
                className="absolute right-1 top-1 rounded-full bg-stone-900/70 p-1 text-white transition hover:bg-red-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {canAddMore && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-stone-300 bg-white text-stone-400 transition hover:border-stone-400 hover:text-stone-600">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={(event) => addFiles(event.target.files)}
                className="sr-only"
              />
              <Plus className="h-5 w-5" />
              <span className="mt-1 text-xs">Add</span>
            </label>
          )}
        </div>
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
