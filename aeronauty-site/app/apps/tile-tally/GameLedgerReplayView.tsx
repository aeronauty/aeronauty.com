"use client";

import Image from "next/image";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  FileUp,
  Film,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { ChangeEvent, ReactNode, SyntheticEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./game-ledger-replay.module.css";

export type GameLedgerReplaySession = {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string | null;
  status?: string;
  subtitle?: string | null;
};

export type GameLedgerReplayTransfer = {
  status: "queued" | "uploading" | "ready" | "error";
  /** A number from 0 to 100. Omit it when progress cannot be measured. */
  progress?: number;
  error?: string | null;
};

type GameLedgerReplayEntryBase = {
  id: string;
  occurredAt: string;
  /** Use this when the parent already has a preferred localized label. */
  timeLabel?: string;
  author?: string | null;
};

export type GameLedgerReplayPhoto = GameLedgerReplayEntryBase & {
  kind: "photo";
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  alt?: string;
  caption?: string | null;
  transfer?: GameLedgerReplayTransfer;
};

export type GameLedgerReplayVideo = GameLedgerReplayEntryBase & {
  kind: "video";
  mediaUrl?: string | null;
  posterUrl?: string | null;
  caption?: string | null;
  durationSeconds?: number | null;
  transfer?: GameLedgerReplayTransfer;
};

export type GameLedgerReplayNote = GameLedgerReplayEntryBase & {
  kind: "note";
  text: string;
};

export type GameLedgerReplayEvent = GameLedgerReplayEntryBase & {
  kind: "event";
  title: string;
  detail?: string | null;
};

export type GameLedgerReplayEntry =
  | GameLedgerReplayPhoto
  | GameLedgerReplayVideo
  | GameLedgerReplayNote
  | GameLedgerReplayEvent;

export type GameLedgerReplayCapture = {
  sessionId: string;
  file: File;
  capturedAt: string;
  durationSeconds?: number;
};

export type GameLedgerReplayNoteDraft = {
  sessionId: string;
  text: string;
  occurredAt: string;
};

export type GameLedgerReplayLimits = {
  maxImageBytes: number;
  maxVideoBytes: number;
  maxVideoSeconds: number;
  maxNoteCharacters: number;
  maxMediaItems: number;
};

export type GameLedgerReplayViewProps = {
  session: GameLedgerReplaySession;
  entries: GameLedgerReplayEntry[];
  onAddPhoto?: (capture: GameLedgerReplayCapture) => void | Promise<void>;
  onAddVideo?: (capture: GameLedgerReplayCapture) => void | Promise<void>;
  onAddNote?: (note: GameLedgerReplayNoteDraft) => void | Promise<void>;
  onDeleteMedia?: (entry: GameLedgerReplayPhoto | GameLedgerReplayVideo) => void | Promise<void>;
  onRetryMedia?: (entry: GameLedgerReplayPhoto | GameLedgerReplayVideo) => void | Promise<void>;
  limits?: Partial<GameLedgerReplayLimits>;
  privacyNotice?: ReactNode;
  consentLabel?: string;
  /** Supply this for controlled consent; otherwise consent is held for this mounted session. */
  captureConsent?: boolean;
  onCaptureConsentChange?: (confirmed: boolean) => void;
  disabled?: boolean;
};

const DEFAULT_LIMITS: GameLedgerReplayLimits = {
  maxImageBytes: 12 * 1024 * 1024,
  maxVideoBytes: 80 * 1024 * 1024,
  maxVideoSeconds: 60,
  maxNoteCharacters: 1_000,
  maxMediaItems: 50,
};

function statusLabel(status: string | undefined) {
  if (!status || status === "active" || status === "in_progress") return "In progress";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type PendingCapture = {
  kind: "photo" | "video";
  file: File;
  capturedAt: string;
  previewUrl: string;
  durationSeconds?: number;
  durationChecked: boolean;
  validationError?: string;
  status: "ready" | "submitting" | "error";
  submitError?: string;
};

type AsyncAction = {
  id: string;
  kind: "delete" | "retry";
} | null;

function isMediaEntry(entry: GameLedgerReplayEntry): entry is GameLedgerReplayPhoto | GameLedgerReplayVideo {
  return entry.kind === "photo" || entry.kind === "video";
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder}s`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "That did not complete. Check your connection and try again.";
}

function clampProgress(progress: number | undefined) {
  if (progress === undefined || !Number.isFinite(progress)) return undefined;
  return Math.min(100, Math.max(0, progress));
}

function TransferStatus({ transfer }: { transfer?: GameLedgerReplayTransfer }) {
  if (!transfer || transfer.status === "ready") {
    return (
      <span className={`${styles.transferLabel} ${styles.transferReady}`}>
        <Check size={13} aria-hidden="true" /> Saved
      </span>
    );
  }

  if (transfer.status === "error") {
    return (
      <span className={`${styles.transferLabel} ${styles.transferError}`}>
        <AlertCircle size={13} aria-hidden="true" /> Unavailable
      </span>
    );
  }

  const value = transfer.status === "uploading" ? clampProgress(transfer.progress) : undefined;
  const label = transfer.status === "queued" ? "Waiting to upload" : value === undefined ? "Uploading" : `Uploading ${Math.round(value)}%`;

  return (
    <div className={styles.transferProgress} aria-label={label}>
      <span><LoaderCircle className={styles.spin} size={13} aria-hidden="true" /> {label}</span>
      <progress max={100} value={value} aria-label={label} />
    </div>
  );
}

function EntryMedia({ entry, replay = false }: { entry: GameLedgerReplayEntry; replay?: boolean }) {
  if (entry.kind === "photo") {
    const source = entry.thumbnailUrl || entry.mediaUrl;
    if (!source) {
      return (
        <div className={`${styles.textMoment} ${styles.eventMoment} ${replay ? styles.replayTextMoment : ""}`}>
          <ImageIcon size={20} aria-hidden="true" />
          <div><strong>Private photo unavailable</strong><p>Its preview link could not be renewed. The original has not been made public.</p></div>
        </div>
      );
    }
    return (
      <div className={`${styles.mediaFrame} ${replay ? styles.replayMediaFrame : ""}`}>
        <Image
          alt={entry.alt || entry.caption || "Photo from this game"}
          fill
          sizes={replay ? "(max-width: 720px) 100vw, 720px" : "(max-width: 720px) 100vw, 640px"}
          src={source}
          unoptimized
        />
      </div>
    );
  }

  if (entry.kind === "video") {
    if (!entry.mediaUrl) {
      return (
        <div className={`${styles.textMoment} ${styles.eventMoment} ${replay ? styles.replayTextMoment : ""}`}>
          <Film size={20} aria-hidden="true" />
          <div><strong>Private video unavailable</strong><p>Its preview link could not be renewed. The original has not been made public.</p></div>
        </div>
      );
    }
    return (
      <div className={`${styles.mediaFrame} ${replay ? styles.replayMediaFrame : ""}`}>
        <video
          controls
          playsInline
          preload="metadata"
          poster={entry.posterUrl || undefined}
          src={entry.mediaUrl}
          aria-label={entry.caption || "Video clip from this game"}
        />
      </div>
    );
  }

  if (entry.kind === "note") {
    return (
      <div className={`${styles.textMoment} ${replay ? styles.replayTextMoment : ""}`}>
        <MessageSquareText size={20} aria-hidden="true" />
        <p>{entry.text}</p>
      </div>
    );
  }

  return (
    <div className={`${styles.textMoment} ${styles.eventMoment} ${replay ? styles.replayTextMoment : ""}`}>
      <Clock3 size={20} aria-hidden="true" />
      <div>
        <strong>{entry.title}</strong>
        {entry.detail && <p>{entry.detail}</p>}
      </div>
    </div>
  );
}

export default function GameLedgerReplayView({
  session,
  entries,
  onAddPhoto,
  onAddVideo,
  onAddNote,
  onDeleteMedia,
  onRetryMedia,
  limits: limitOverrides,
  privacyNotice,
  consentLabel = "Everyone being recorded has agreed to photos and short video clips for this session.",
  captureConsent,
  onCaptureConsentChange,
  disabled = false,
}: GameLedgerReplayViewProps) {
  const limits = useMemo(() => ({ ...DEFAULT_LIMITS, ...limitOverrides }), [limitOverrides]);
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => {
      const timeDifference = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
      return timeDifference || a.id.localeCompare(b.id);
    }),
    [entries],
  );
  const mediaCount = entries.filter(isMediaEntry).length;
  const mediaLimitReached = mediaCount >= limits.maxMediaItems;

  const [internalConsent, setInternalConsent] = useState(false);
  const hasConsent = captureConsent ?? internalConsent;
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [asyncAction, setAsyncAction] = useState<AsyncAction>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const activeSessionIdRef = useRef(session.id);
  activeSessionIdRef.current = session.id;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const replayOverlayRef = useRef<HTMLDivElement>(null);
  const replayDialogRef = useRef<HTMLDivElement>(null);
  const replayCloseRef = useRef<HTMLButtonElement>(null);
  const consentId = useId();
  const noteId = useId();

  useEffect(() => {
    setPending(null);
    setSelectionError(null);
    setReplayId(null);
    setConfirmDeleteId(null);
    setActionError(null);
    setNote("");
    setNoteStatus("idle");
    setNoteError(null);
    setInternalConsent(false);
  }, [session.id]);

  useEffect(() => {
    if (!hasConsent) setPending(null);
  }, [hasConsent]);

  const pendingPreviewUrl = pending?.previewUrl;
  useEffect(() => {
    if (!pendingPreviewUrl) return undefined;
    return () => URL.revokeObjectURL(pendingPreviewUrl);
  }, [pendingPreviewUrl]);

  const replayIndex = replayId ? sortedEntries.findIndex((entry) => entry.id === replayId) : -1;
  const replayEntry = replayIndex >= 0 ? sortedEntries[replayIndex] : null;
  const replayOpen = Boolean(replayEntry);
  const cameraDisabled = disabled || !hasConsent || mediaLimitReached;
  const libraryAccept = onAddPhoto && onAddVideo ? "image/*,video/*" : onAddPhoto ? "image/*" : "video/*";

  useEffect(() => {
    if (!replayOpen) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const isolated: Array<{ ariaHidden: string | null; element: HTMLElement; inert: boolean }> = [];
    document.body.style.overflow = "hidden";
    replayCloseRef.current?.focus();

    let current: HTMLElement | null = replayOverlayRef.current;
    while (current && current !== document.body) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        isolated.push({
          ariaHidden: sibling.getAttribute("aria-hidden"),
          element: sibling,
          inert: sibling.inert,
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      current = parent;
    }

    function handleReplayKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setReplayId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(replayDialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), video[controls], [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleReplayKeydown);
    return () => {
      document.removeEventListener("keydown", handleReplayKeydown);
      document.body.style.overflow = previousOverflow;
      for (const item of isolated) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      previouslyFocused?.focus();
    };
  }, [replayOpen]);

  function setConsent(confirmed: boolean) {
    if (captureConsent === undefined) setInternalConsent(confirmed);
    onCaptureConsentChange?.(confirmed);
  }

  function resetInput(input: HTMLInputElement) {
    input.value = "";
  }

  function stageFile(file: File, expectedKind?: "photo" | "video") {
    setSelectionError(null);

    const mimeKind = file.type.startsWith("image/")
      ? "photo"
      : file.type.startsWith("video/")
        ? "video"
        : undefined;
    const inferredKind = mimeKind || (!file.type ? expectedKind : undefined);

    if (!inferredKind || (expectedKind && inferredKind !== expectedKind)) {
      setSelectionError(expectedKind === "photo" ? "Choose an image file." : expectedKind === "video" ? "Choose a video file." : "Choose an image or video file.");
      return;
    }

    if ((inferredKind === "photo" && !onAddPhoto) || (inferredKind === "video" && !onAddVideo)) {
      setSelectionError(`${inferredKind === "photo" ? "Photo" : "Video"} capture is not enabled for this session.`);
      return;
    }

    if (inferredKind === "photo" && file.size > limits.maxImageBytes) {
      setSelectionError(`That photo is ${formatBytes(file.size)}. Choose one under ${formatBytes(limits.maxImageBytes)}.`);
      return;
    }

    if (inferredKind === "video" && file.size > limits.maxVideoBytes) {
      setSelectionError(`That clip is ${formatBytes(file.size)}. Choose one under ${formatBytes(limits.maxVideoBytes)}.`);
      return;
    }

    setPending({
      kind: inferredKind,
      file,
      capturedAt: new Date().toISOString(),
      previewUrl: URL.createObjectURL(file),
      durationChecked: inferredKind === "photo",
      status: "ready",
    });
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>, expectedKind?: "photo" | "video") {
    const file = event.currentTarget.files?.[0];
    if (file) stageFile(file, expectedKind);
    resetInput(event.currentTarget);
  }

  function handleVideoMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const duration = event.currentTarget.duration;
    setPending((current) => {
      if (!current || current.kind !== "video") return current;
      if (!Number.isFinite(duration) || duration <= 0) {
        return {
          ...current,
          durationChecked: true,
          validationError: "The clip length could not be read. Choose a different video.",
        };
      }
      if (duration > limits.maxVideoSeconds + 0.25) {
        return {
          ...current,
          durationSeconds: duration,
          durationChecked: true,
          validationError: `This clip is ${formatDuration(duration)}. Keep clips to ${formatDuration(limits.maxVideoSeconds)} or less.`,
        };
      }
      return {
        ...current,
        durationSeconds: duration,
        durationChecked: true,
        validationError: undefined,
      };
    });
  }

  function handleVideoPreviewError() {
    setPending((current) => current && current.kind === "video"
      ? { ...current, durationChecked: true, validationError: "This video could not be previewed. Choose a different clip." }
      : current);
  }

  async function submitPending() {
    if (!hasConsent || !pending || pending.validationError || !pending.durationChecked || pending.status === "submitting") return;
    const callback = pending.kind === "photo" ? onAddPhoto : onAddVideo;
    if (!callback) return;

    const submittedFile = pending.file;
    const submittedSessionId = session.id;
    setPending((current) => current ? { ...current, status: "submitting", submitError: undefined } : current);
    try {
      await callback({
        sessionId: submittedSessionId,
        file: submittedFile,
        capturedAt: pending.capturedAt,
        durationSeconds: pending.durationSeconds,
      });
      if (activeSessionIdRef.current === submittedSessionId) {
        setPending((current) => current?.file === submittedFile ? null : current);
      }
    } catch (error) {
      if (activeSessionIdRef.current === submittedSessionId) {
        setPending((current) => current?.file === submittedFile
          ? { ...current, status: "error", submitError: errorMessage(error) }
          : current);
      }
    }
  }

  async function submitNote() {
    const text = note.trim();
    if (!text || !onAddNote || noteStatus === "submitting") return;
    const submittedSessionId = session.id;
    setNoteStatus("submitting");
    setNoteError(null);
    try {
      await onAddNote({ sessionId: submittedSessionId, text, occurredAt: new Date().toISOString() });
      if (activeSessionIdRef.current !== submittedSessionId) return;
      setNote("");
      setNoteStatus("idle");
    } catch (error) {
      if (activeSessionIdRef.current !== submittedSessionId) return;
      setNoteStatus("error");
      setNoteError(errorMessage(error));
    }
  }

  async function runMediaAction(entry: GameLedgerReplayPhoto | GameLedgerReplayVideo, kind: "delete" | "retry") {
    const callback = kind === "delete" ? onDeleteMedia : onRetryMedia;
    if (!callback || asyncAction) return;
    setAsyncAction({ id: entry.id, kind });
    setActionError(null);
    try {
      await callback(entry);
      setConfirmDeleteId(null);
    } catch (error) {
      setActionError({ id: entry.id, message: errorMessage(error) });
    } finally {
      setAsyncAction(null);
    }
  }

  return (
    <section className={styles.ledgerReplayView} aria-labelledby="game-ledger-replay-title">
      <header className={styles.sessionHeader}>
        <div>
          <p className={styles.kicker}>Session story</p>
          <h2 id="game-ledger-replay-title">{session.title}</h2>
          {session.subtitle && <p className={styles.subtitle}>{session.subtitle}</p>}
        </div>
        <div className={styles.sessionMeta}>
          <span className={session.status === "complete" ? styles.completeStatus : styles.activeStatus}>
            {session.status === "complete" ? <Check size={14} aria-hidden="true" /> : <CircleStop size={14} aria-hidden="true" />}
            {statusLabel(session.status)}
          </span>
          <time dateTime={session.startedAt}>Started {formatTime(session.startedAt)}</time>
        </div>
      </header>

      <div className={styles.privacyCard}>
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h3>Capture by consent</h3>
          <div className={styles.privacyCopy}>
            {privacyNotice || (
              <p>
                Photos and video can contain faces, voices, and location clues. Nothing records in the background:
                the camera opens only when you tap a capture button. Your app controls storage and sharing.
              </p>
            )}
          </div>
          <label className={styles.consentRow} htmlFor={consentId}>
            <input
              checked={hasConsent}
              disabled={disabled}
              id={consentId}
              onChange={(event) => setConsent(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{consentLabel}</span>
          </label>
        </div>
      </div>

      <div className={styles.capturePanel}>
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.kicker}>Add a moment</p>
            <h3>Camera and notes</h3>
          </div>
          <span className={styles.cameraState}><LockKeyhole size={13} aria-hidden="true" /> Camera off</span>
        </div>

        <div className={styles.captureActions}>
          {onAddPhoto && (
            <button
              className={styles.captureButton}
              disabled={cameraDisabled}
              onClick={() => photoInputRef.current?.click()}
              type="button"
            >
              <Camera size={21} aria-hidden="true" />
              <span><strong>Take photo</strong><small>Opens the camera</small></span>
            </button>
          )}
          {onAddVideo && (
            <button
              className={styles.captureButton}
              disabled={cameraDisabled}
              onClick={() => videoInputRef.current?.click()}
              type="button"
            >
              <Video size={21} aria-hidden="true" />
              <span><strong>Record clip</strong><small>Up to {formatDuration(limits.maxVideoSeconds)}</small></span>
            </button>
          )}
          {(onAddPhoto || onAddVideo) && (
            <button
              className={styles.captureButton}
              disabled={cameraDisabled}
              onClick={() => libraryInputRef.current?.click()}
              type="button"
            >
              <FileUp size={21} aria-hidden="true" />
              <span><strong>Choose file</strong><small>Photo or short clip</small></span>
            </button>
          )}
        </div>

        <input
          ref={photoInputRef}
          accept="image/*"
          aria-label="Take a photo"
          capture="environment"
          className={styles.visuallyHidden}
          onChange={(event) => handleFile(event, "photo")}
          tabIndex={-1}
          type="file"
        />
        <input
          ref={videoInputRef}
          accept="video/*"
          aria-label="Record a video clip"
          capture="environment"
          className={styles.visuallyHidden}
          onChange={(event) => handleFile(event, "video")}
          tabIndex={-1}
          type="file"
        />
        <input
          ref={libraryInputRef}
          accept={libraryAccept}
          aria-label="Choose a photo or video"
          className={styles.visuallyHidden}
          onChange={(event) => handleFile(event)}
          tabIndex={-1}
          type="file"
        />

        {!hasConsent && (onAddPhoto || onAddVideo) && (
          <p className={styles.captureHint}>Confirm everyone’s consent above to enable photo and video capture.</p>
        )}
        {mediaLimitReached && (
          <p className={styles.limitMessage} role="status">
            This session has reached its {limits.maxMediaItems}-item media limit. Remove an item before adding another.
          </p>
        )}
        {selectionError && <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {selectionError}</p>}

        <p className={styles.limitSummary}>
          Photos ≤ {formatBytes(limits.maxImageBytes)} · Videos ≤ {formatDuration(limits.maxVideoSeconds)} and {formatBytes(limits.maxVideoBytes)} · {mediaCount}/{limits.maxMediaItems} media
        </p>

        {pending && (
          <div className={styles.previewCard} aria-live="polite">
            <div className={styles.previewMedia}>
              {pending.kind === "photo" ? (
                <Image alt="Selected photo preview" fill sizes="(max-width: 720px) 100vw, 320px" src={pending.previewUrl} unoptimized />
              ) : (
                <video
                  controls
                  onError={handleVideoPreviewError}
                  onLoadedMetadata={handleVideoMetadata}
                  playsInline
                  preload="metadata"
                  src={pending.previewUrl}
                />
              )}
            </div>
            <div className={styles.previewDetails}>
              <span className={styles.previewType}>
                {pending.kind === "photo" ? <ImageIcon size={15} aria-hidden="true" /> : <Film size={15} aria-hidden="true" />}
                {pending.kind === "photo" ? "Photo preview" : "Video preview"}
              </span>
              <strong title={pending.file.name}>{pending.file.name}</strong>
              <small>
                {formatBytes(pending.file.size)}
                {pending.durationSeconds ? ` · ${formatDuration(pending.durationSeconds)}` : ""}
              </small>
              {!pending.durationChecked && <span className={styles.checking}><LoaderCircle className={styles.spin} size={14} aria-hidden="true" /> Checking clip length…</span>}
              {pending.validationError && <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {pending.validationError}</p>}
              {pending.submitError && <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {pending.submitError}</p>}
              <div className={styles.previewActions}>
                <button className={styles.secondaryButton} disabled={pending.status === "submitting"} onClick={() => setPending(null)} type="button">
                  <X size={16} aria-hidden="true" /> Discard
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={disabled || !hasConsent || pending.status === "submitting" || !pending.durationChecked || Boolean(pending.validationError)}
                  onClick={submitPending}
                  type="button"
                >
                  {pending.status === "submitting" ? <LoaderCircle className={styles.spin} size={16} aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
                  {pending.status === "submitting" ? "Handing off…" : pending.status === "error" ? "Try again" : "Add to timeline"}
                </button>
              </div>
              <p className={styles.handoffCopy}>The file is sent only when you tap “Add to timeline.” Your app’s callback controls the actual upload.</p>
            </div>
          </div>
        )}

        {onAddNote && (
          <div className={styles.noteComposer}>
            <label htmlFor={noteId}>Add a note</label>
            <textarea
              disabled={disabled || noteStatus === "submitting"}
              id={noteId}
              maxLength={limits.maxNoteCharacters}
              onChange={(event) => setNote(event.currentTarget.value)}
              placeholder="What happened at this point in the game?"
              rows={3}
              value={note}
            />
            <div className={styles.noteFooter}>
              <span>{note.length}/{limits.maxNoteCharacters}</span>
              <button
                className={styles.secondaryButton}
                disabled={disabled || noteStatus === "submitting" || !note.trim()}
                onClick={submitNote}
                type="button"
              >
                {noteStatus === "submitting" ? <LoaderCircle className={styles.spin} size={16} aria-hidden="true" /> : <MessageSquareText size={16} aria-hidden="true" />}
                {noteStatus === "submitting" ? "Adding…" : "Add note"}
              </button>
            </div>
            {noteStatus === "error" && noteError && <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {noteError}</p>}
          </div>
        )}
      </div>

      <div className={styles.timelineSection}>
        <div className={styles.timelineHeading}>
          <div>
            <p className={styles.kicker}>Chronological replay</p>
            <h3>{sortedEntries.length ? `${sortedEntries.length} recorded ${sortedEntries.length === 1 ? "moment" : "moments"}` : "No moments yet"}</h3>
          </div>
          <button
            className={styles.replayButton}
            disabled={!sortedEntries.length}
            onClick={() => setReplayId(sortedEntries[0]?.id ?? null)}
            type="button"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" /> Replay from start
          </button>
        </div>

        {!sortedEntries.length ? (
          <div className={styles.emptyTimeline}>
            <Camera size={26} aria-hidden="true" />
            <strong>The story starts with your next moment.</strong>
            <p>Add a note, photo, or short clip. Entries stay in the order they happened.</p>
          </div>
        ) : (
          <ol className={styles.timelineList}>
            {sortedEntries.map((entry, index) => {
              const actionBusy = asyncAction?.id === entry.id;
              const controlsDisabled = disabled || actionBusy;
              const deleting = actionBusy && asyncAction?.kind === "delete";
              const retrying = actionBusy && asyncAction?.kind === "retry";
              return (
                <li className={styles.timelineItem} key={entry.id}>
                  <div className={styles.timelineRail} aria-hidden="true">
                    <span>{index + 1}</span>
                  </div>
                  <article className={styles.momentCard}>
                    <header className={styles.momentHeader}>
                      <div>
                        <span className={styles.momentKind}>
                          {entry.kind === "photo" && <><ImageIcon size={14} aria-hidden="true" /> Photo</>}
                          {entry.kind === "video" && <><Film size={14} aria-hidden="true" /> Video</>}
                          {entry.kind === "note" && <><MessageSquareText size={14} aria-hidden="true" /> Note</>}
                          {entry.kind === "event" && <><Clock3 size={14} aria-hidden="true" /> Game event</>}
                        </span>
                        {entry.author && <span className={styles.author}>by {entry.author}</span>}
                      </div>
                      <time dateTime={entry.occurredAt}>{entry.timeLabel || formatTime(entry.occurredAt)}</time>
                    </header>
                    <EntryMedia entry={entry} />
                    {isMediaEntry(entry) && (
                      <div className={styles.mediaDetails}>
                        {entry.caption && <p>{entry.caption}</p>}
                        <TransferStatus transfer={entry.transfer} />
                        {entry.transfer?.status === "error" && entry.transfer.error && (
                          <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {entry.transfer.error}</p>
                        )}
                        {actionError?.id === entry.id && (
                          <p className={styles.errorMessage} role="alert"><AlertCircle size={15} aria-hidden="true" /> {actionError.message}</p>
                        )}
                        <div className={styles.mediaActions}>
                          {entry.transfer?.status === "error" && onRetryMedia && (
                            <button className={styles.textButton} disabled={controlsDisabled} onClick={() => runMediaAction(entry, "retry")} type="button">
                              {retrying ? <LoaderCircle className={styles.spin} size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                              {retrying ? "Retrying…" : "Retry upload"}
                            </button>
                          )}
                          {onDeleteMedia && confirmDeleteId !== entry.id && (
                            <button className={`${styles.textButton} ${styles.dangerButton}`} disabled={controlsDisabled} onClick={() => setConfirmDeleteId(entry.id)} type="button">
                              <Trash2 size={15} aria-hidden="true" /> Remove
                            </button>
                          )}
                        </div>
                        {confirmDeleteId === entry.id && (
                          <div className={styles.deleteConfirm} role="group" aria-label="Confirm media removal">
                            <p>Remove this {entry.kind} from the session?</p>
                            <button className={styles.textButton} disabled={controlsDisabled} onClick={() => setConfirmDeleteId(null)} type="button">Keep it</button>
                            <button className={`${styles.textButton} ${styles.dangerButton}`} disabled={controlsDisabled} onClick={() => runMediaAction(entry, "delete")} type="button">
                              {deleting && <LoaderCircle className={styles.spin} size={15} aria-hidden="true" />}
                              {deleting ? "Removing…" : "Remove media"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {replayEntry && (
        <div className={styles.replayOverlay} ref={replayOverlayRef} role="dialog" aria-modal="true" aria-labelledby="replay-dialog-title">
          <div className={styles.replayDialog} ref={replayDialogRef}>
            <header className={styles.replayHeader}>
              <div>
                <p className={styles.kicker}>Moment {replayIndex + 1} of {sortedEntries.length}</p>
                <h3 id="replay-dialog-title">Replay {session.title}</h3>
              </div>
              <button className={styles.iconButton} onClick={() => setReplayId(null)} ref={replayCloseRef} type="button" aria-label="Close replay">
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.replayStage}>
              <EntryMedia entry={replayEntry} replay />
              <div className={styles.replayCaption}>
                <time dateTime={replayEntry.occurredAt}>{replayEntry.timeLabel || formatTime(replayEntry.occurredAt)}</time>
                {isMediaEntry(replayEntry) && replayEntry.caption && <p>{replayEntry.caption}</p>}
                {replayEntry.author && <span>Recorded by {replayEntry.author}</span>}
              </div>
            </div>
            <footer className={styles.replayControls}>
              <button
                className={styles.secondaryButton}
                disabled={replayIndex <= 0}
                onClick={() => setReplayId(sortedEntries[replayIndex - 1]?.id ?? replayEntry.id)}
                type="button"
              >
                <ChevronLeft size={18} aria-hidden="true" /> Previous
              </button>
              <div className={styles.replayDots} aria-hidden="true">
                {sortedEntries.map((entry, index) => <span className={index === replayIndex ? styles.currentDot : ""} key={entry.id} />)}
              </div>
              {replayIndex < sortedEntries.length - 1 ? (
                <button className={styles.primaryButton} onClick={() => setReplayId(sortedEntries[replayIndex + 1]?.id ?? replayEntry.id)} type="button">
                  Next <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : (
                <button className={styles.primaryButton} onClick={() => setReplayId(null)} type="button">
                  <Check size={18} aria-hidden="true" /> Done
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
