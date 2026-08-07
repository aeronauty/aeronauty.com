"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ImagePlus, Mic, Send, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import ProposalEditor from "./ProposalEditor";
import { formatSpokenScoreTranscript } from "./spokenNumbers";
import type {
  ChatMessage,
  PendingAction,
  PendingProposal,
  Player,
  ScorePhoto,
} from "./types";
import styles from "./tile-tally.module.css";

type Props = {
  accessToken: string;
  players: Player[];
  busy: boolean;
  onUploadPhoto: (file: File) => Promise<ScorePhoto>;
  onRefresh: () => Promise<void>;
};

type ApiResponse = {
  reply?: unknown;
  action?: unknown;
  eventId?: unknown;
  error?: unknown;
};

type SpeechResultEvent = { results: { 0?: { 0?: { transcript?: string } } } };
type SpeechErrorEvent = { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function isPendingAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return (
    (candidate.type === "log_game" || candidate.type === "add_turn" || candidate.type === "finish_game") &&
    Boolean(candidate.payload) &&
    typeof candidate.payload === "object" &&
    !Array.isArray(candidate.payload)
  );
}

async function postJson(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ApiResponse;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The assistant could not complete that request.");
  }
  return data;
}

function textFromReply(reply: unknown, fallback: string) {
  return typeof reply === "string" && reply.trim() ? reply : fallback;
}

export default function AssistantView({
  accessToken,
  players,
  busy,
  onUploadPhoto,
  onRefresh,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Tell me about a game, add a turn, or ask a question about the ledger. I will always show proposed writes before saving them.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [retainedPhotoName, setRetainedPhotoName] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    setSpeechAvailable(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.stop();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const appendAssistant = (content: string) =>
    setMessages((current) => [...current, { id: randomId(), role: "assistant", content }]);

  async function propose(
    rawInput: string,
    source: "chat" | "voice",
    originalVoiceTranscript?: string,
  ) {
    const clean = rawInput.trim();
    if (!clean || requestBusy || pending) return;
    setRequestBusy(true);
    setRequestError(null);
    const userMessage: ChatMessage = { id: randomId(), role: "user", content: clean };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    try {
      const response = await postJson("/api/tile-tally/chat", accessToken, {
        mode: "propose",
        source,
        messages: nextMessages
          .filter((message) => message.id !== "welcome")
          .map(({ role, content }) => ({ role, content })),
        context: { players: players.map((player) => player.name) },
        ...(source === "voice" && originalVoiceTranscript !== undefined
          ? { rawInput: originalVoiceTranscript }
          : {}),
      });
      appendAssistant(textFromReply(response.reply, isPendingAction(response.action) ? "Please review this proposed change." : "I could not find an answer in the ledger."));
      if (isPendingAction(response.action)) {
        setPending({
          action: response.action,
          eventId: typeof response.eventId === "string" ? response.eventId : undefined,
          source,
          rawInput: clean,
        });
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The assistant could not answer.");
    } finally {
      setRequestBusy(false);
    }
  }

  async function savePending() {
    if (!pending?.eventId) {
      setRequestError("This preview has expired. Discard it and ask the assistant to prepare it again.");
      return;
    }
    setRequestBusy(true);
    setRequestError(null);
    try {
      const revised = await postJson("/api/tile-tally/chat", accessToken, {
        mode: "revise",
        eventId: pending.eventId,
        action: pending.action,
      });
      const revisedEventId = typeof revised.eventId === "string" ? revised.eventId : pending.eventId;
      const committed = await postJson("/api/tile-tally/chat", accessToken, {
        mode: "commit",
        eventId: revisedEventId,
      });
      appendAssistant(textFromReply(committed.reply, "Saved. The new rows are now in your ledger."));
      setPending(null);
      setRetainedPhotoName(null);
      await onRefresh();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The proposed change could not be saved.");
    } finally {
      setRequestBusy(false);
    }
  }

  async function discardPending() {
    if (!pending) return;
    setRequestBusy(true);
    setRequestError(null);
    try {
      if (pending.eventId) {
        await postJson("/api/tile-tally/chat", accessToken, { mode: "reject", eventId: pending.eventId });
      }
      if (pending.source === "photo") {
        appendAssistant("The proposed game and turn rows were discarded. The original score sheet remains stored privately as provenance.");
      }
      setPending(null);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "This pending action could not be discarded.");
    } finally {
      setRequestBusy(false);
    }
  }

  function startListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setRequestError("Voice entry is not available in this browser. Type the same words below instead.");
      inputRef.current?.focus();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const rawTranscript = event.results[0]?.[0]?.transcript ?? "";
      const transcript = rawTranscript.trim();
      const scoreAwareTranscript = formatSpokenScoreTranscript(transcript);
      setInput(scoreAwareTranscript);
      if (scoreAwareTranscript) void propose(scoreAwareTranscript, "voice", rawTranscript);
    };
    recognition.onerror = (event) => {
      setRequestError(
        event.error === "not-allowed"
          ? "Microphone access was not allowed. You can type the score instead."
          : "I could not hear that clearly. Try again or type it instead.",
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    setRequestError(null);
    recognition.start();
  }

  async function handlePhoto(file: File) {
    setRequestBusy(true);
    setRequestError(null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const previewUrl = URL.createObjectURL(file);
    previewRef.current = previewUrl;
    setPhotoPreview(previewUrl);
    setRetainedPhotoName(file.name);
    try {
      const photo = await onUploadPhoto(file);
      const response = await postJson("/api/tile-tally/vision", accessToken, { photoId: photo.id });
      appendAssistant(textFromReply(response.reply, "I deciphered the sheet. Check every row before saving."));
      if (!isPendingAction(response.action)) {
        throw new Error("The image was retained, but no editable scores could be extracted from it.");
      }
      setPending({
        action: response.action,
        eventId: typeof response.eventId === "string" ? response.eventId : undefined,
        source: "photo",
        photoId: photo.id,
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The score sheet could not be deciphered.");
    } finally {
      setRequestBusy(false);
    }
  }

  const working = busy || requestBusy;

  return (
    <div className={styles.assistantLayout}>
      <section className={styles.chatPanel} aria-labelledby="assistant-heading">
        <header className={styles.viewHeader}>
          <p className={styles.kicker}>Ask the ledger</p>
          <h2 id="assistant-heading">Assistant</h2>
          <p>Log naturally or ask for a real statistic. Proposed writes wait for your approval.</p>
        </header>

        <div className={styles.chatMessages} aria-live="polite" aria-label="Conversation">
          {messages.map((message) => (
            <div className={`${styles.chatBubble} ${message.role === "user" ? styles.userBubble : styles.assistantBubble}`} key={message.id}>
              {message.role === "assistant" && <Sparkles size={15} aria-hidden="true" />}
              <p>{message.content}</p>
            </div>
          ))}
          {requestBusy && <div className={`${styles.chatBubble} ${styles.assistantBubble}`}><span className={styles.thinkingDots}>•••</span></div>}
        </div>

        {requestError && <div className={styles.inlineError} role="alert">{requestError}</div>}

        <form
          className={styles.chatComposer}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void propose(input, "chat");
          }}
        >
          <label className={styles.srOnly} htmlFor="tile-tally-message">Message the Tile Tally assistant</label>
          <textarea
            id="tile-tally-message"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder='“Dad and I played today…” or “What is my average this month?”'
            rows={3}
            disabled={working || Boolean(pending)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void propose(input, "chat");
              }
            }}
          />
          <div className={styles.composerActions}>
            <button
              className={`${styles.voiceButton} ${listening ? styles.voiceButtonActive : ""}`}
              type="button"
              onClick={startListening}
              disabled={working || Boolean(pending)}
              aria-pressed={listening}
            >
              <Mic size={17} aria-hidden="true" /> {listening ? "Listening…" : "Speak"}
            </button>
            <button className={styles.primaryButton} type="submit" disabled={working || Boolean(pending) || !input.trim()}>
              <Send size={17} aria-hidden="true" /> Send
            </button>
          </div>
          {speechAvailable === false && (
            <p className={styles.helpText}>Voice recognition is unavailable here; typing provides the same confirmation flow.</p>
          )}
        </form>
      </section>

      {pending && (
        <ProposalEditor
          action={pending.action}
          players={players}
          sourceLabel={pending.source === "photo" ? "Photo" : pending.source === "voice" ? "Voice" : "Chat"}
          busy={working}
          photoPreview={pending.source === "photo" ? photoPreview : null}
          onChange={(action) => setPending((current) => (current ? { ...current, action } : current))}
          onSave={() => void savePending()}
          onCancel={() => void discardPending()}
        />
      )}

      <section className={styles.photoPanel} aria-labelledby="photo-heading">
        <div className={styles.photoIcon}><Camera size={24} aria-hidden="true" /></div>
        <div>
          <p className={styles.kicker}>Paper score sheet</p>
          <h2 id="photo-heading">Decipher a photo</h2>
          <p>Upload or take a picture. The original stays private and the extracted rows remain editable until you save.</p>
          <label className={`${styles.secondaryButton} ${working || Boolean(pending) ? styles.disabledButton : ""}`}>
            <ImagePlus size={17} aria-hidden="true" /> Choose score sheet
            <input
              className={styles.hiddenFileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={working || Boolean(pending)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handlePhoto(file);
              }}
            />
          </label>
          {retainedPhotoName && !pending && (
            <p className={styles.helpText}><ShieldCheck size={14} aria-hidden="true" /> {retainedPhotoName} is retained privately.</p>
          )}
        </div>
      </section>

      <aside className={styles.assistantNote}>
        <Volume2 size={18} aria-hidden="true" />
        <p><strong>Confirmation is the rule.</strong> Chat, voice and photo can prepare rows, but only your Save writes game and turn rows.</p>
      </aside>
    </div>
  );
}
