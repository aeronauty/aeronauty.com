"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./google-identity-button.module.css";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

type CredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (options: {
    callback: (response: CredentialResponse) => void;
    client_id: string;
    nonce: string;
    ux_mode: "popup";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      logo_alignment: "left";
      shape: "rectangular";
      size: "large";
      text: "continue_with";
      theme: "outline";
      type: "standard";
      width: number;
    },
  ) => void;
};

type WindowWithGoogle = Window & {
  google?: {
    accounts?: {
      id?: GoogleIdentityApi;
    };
  };
};

function googleIdentityApi() {
  return (window as WindowWithGoogle).google?.accounts?.id;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createNoncePair() {
  if (!window.crypto?.getRandomValues || !window.crypto.subtle) {
    throw new Error("This browser cannot create a secure sign-in nonce.");
  }

  const rawNonce = bytesToBase64Url(window.crypto.getRandomValues(new Uint8Array(32)));
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawNonce),
  );
  const hashedNonce = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return { rawNonce, hashedNonce };
}

type GoogleIdentityButtonProps = {
  busy: boolean;
  clientId?: string;
  onCredential: (credential: string, rawNonce: string) => Promise<void>;
  onRedirectFallback: () => Promise<void>;
};

export default function GoogleIdentityButton({
  busy,
  clientId,
  onCredential,
  onRedirectFallback,
}: GoogleIdentityButtonProps) {
  const buttonHostRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const currentButtonHost = buttonHostRef.current;
    if (!currentButtonHost) return;
    const buttonHost: HTMLDivElement = currentButtonHost;

    let disposed = false;
    let exchangeInFlight = false;
    let script: HTMLScriptElement | null = null;
    let scriptCreatedHere = false;
    let removeScriptListeners = () => undefined;

    setReady(false);
    setLoadError(null);
    buttonHost.replaceChildren();

    async function loadGoogleIdentity() {
      if (googleIdentityApi()) return;

      await new Promise<void>((resolve, reject) => {
        script = document.querySelector<HTMLScriptElement>(
          `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
        );
        if (!script) {
          script = document.createElement("script");
          script.src = GOOGLE_IDENTITY_SCRIPT;
          script.async = true;
          script.defer = true;
          script.dataset.tileTallyGoogleIdentity = "true";
          scriptCreatedHere = true;
          document.head.appendChild(script);
        }

        const loaded = () => resolve();
        const failed = () => reject(new Error("Google sign-in could not be loaded."));
        script.addEventListener("load", loaded, { once: true });
        script.addEventListener("error", failed, { once: true });
        removeScriptListeners = () => {
          script?.removeEventListener("load", loaded);
          script?.removeEventListener("error", failed);
        };
      });
    }

    async function initialise() {
      if (!clientId) {
        setLoadError("Secure Google sign-in is not configured yet.");
        return;
      }

      try {
        const { rawNonce, hashedNonce } = await createNoncePair();
        if (disposed) return;
        await loadGoogleIdentity();
        if (disposed) return;

        const google = googleIdentityApi();
        if (!google) throw new Error("Google sign-in did not become available.");

        google.initialize({
          client_id: clientId,
          nonce: hashedNonce,
          ux_mode: "popup",
          callback: (response) => {
            if (disposed || exchangeInFlight) return;
            if (!response.credential) {
              setLoadError("Google did not return a sign-in credential. Please try again.");
              setAttempt((current) => current + 1);
              return;
            }

            exchangeInFlight = true;
            void onCredential(response.credential, rawNonce)
              .catch(() => {
                if (!disposed) setAttempt((current) => current + 1);
              })
              .finally(() => {
                exchangeInFlight = false;
              });
          },
        });

        const availableWidth = Math.floor(buttonHost.getBoundingClientRect().width || 320);
        google.renderButton(buttonHost, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.min(400, Math.max(220, availableWidth)),
        });
        setReady(true);
      } catch (error) {
        if (!disposed) {
          setLoadError(error instanceof Error ? error.message : "Google sign-in could not be loaded.");
        }
      }
    }

    void initialise();

    return () => {
      disposed = true;
      removeScriptListeners();
      buttonHost.replaceChildren();
      if (scriptCreatedHere) script?.remove();
    };
  }, [attempt, clientId, onCredential]);

  return (
    <div className={styles.authChoices} aria-busy={busy}>
      <div
        className={`${styles.googleButtonHost} ${busy ? styles.busy : ""}`}
        ref={buttonHostRef}
        data-testid="google-identity-button"
      />
      {!ready && !loadError && (
        <p className={styles.status} role="status">Loading secure Google sign-in…</p>
      )}
      {loadError && <p className={styles.loadError} role="alert">{loadError}</p>}
      <button
        className={styles.redirectFallback}
        type="button"
        onClick={() => void onRedirectFallback()}
        disabled={busy}
      >
        Use redirect sign-in instead
      </button>
      <p className={styles.fallbackNote}>
        The redirect option is temporary and may show the Supabase project address.
      </p>
    </div>
  );
}
