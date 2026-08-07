"use client";

import { useState } from "react";
import { BookOpenText, Grid3X3, LoaderCircle, LogOut, RotateCw, X } from "lucide-react";
import GameLedgerView from "./GameLedgerView";
import GoogleIdentityButton from "./GoogleIdentityButton";
import TilesView from "./TilesView";
import { useGameLedger } from "./useGameLedger";
import styles from "./tile-tally.module.css";

type Tab = "games" | "tiles";

const TABS: Array<{ id: Tab; label: string; icon: typeof BookOpenText }> = [
  { id: "games", label: "Games", icon: BookOpenText },
  { id: "tiles", label: "Tile table", icon: Grid3X3 },
];

function Wordmark() {
  return (
    <div className={styles.wordmark} aria-label="Aeronauty Game Ledger">
      <span className={styles.ledgerLogoMark} aria-hidden="true"><BookOpenText size={19} /></span>
      <strong>Game Ledger</strong>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className={styles.centeredPage}>
      <Wordmark />
      <LoaderCircle className={styles.spinner} size={25} aria-hidden="true" />
      <p>Opening your game book…</p>
    </main>
  );
}

function LoginScreen({
  onGoogleCredential,
  onRedirectSignIn,
  error,
  busy,
}: {
  onGoogleCredential: (credential: string, nonce: string) => Promise<void>;
  onRedirectSignIn: () => Promise<void>;
  error: string | null;
  busy: boolean;
}) {
  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard}>
        <Wordmark />
        <p className={styles.loginEyebrow}>A private record of play</p>
        <h1>Keep the story, not only the final score.</h1>
        <p className={styles.loginLead}>Define any game, tally it your way, and replay its scores, notes, photos and short clips later.</p>
        <ul className={styles.loginFeatures}>
          <li><span>01</span> Counters and fields shaped by you</li>
          <li><span>02</span> One chronological game timeline</li>
          <li><span>03</span> Private, account-isolated media</li>
        </ul>
        {error && <div className={styles.inlineError} role="alert">{error}</div>}
        <GoogleIdentityButton
          busy={busy}
          clientId={process.env.NEXT_PUBLIC_TILETALLY_GOOGLE_CLIENT_ID}
          onCredential={onGoogleCredential}
          onRedirectFallback={onRedirectSignIn}
        />
        <p className={styles.securityCopy}>Google proves who you are; Supabase keeps each account&apos;s ledger isolated.</p>
      </section>
    </main>
  );
}

function ConfigurationScreen({ message }: { message: string }) {
  return (
    <main className={styles.centeredPage}>
      <Wordmark />
      <section className={styles.configurationCard}>
        <p className={styles.kicker}>Setup needed</p>
        <h1>Game Ledger is not connected yet</h1>
        <p>Add the public Supabase URL and publishable key to this deployment, then reload. Server-only keys do not belong in the browser.</p>
        <code>{message}</code>
        <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>
          <RotateCw size={16} aria-hidden="true" /> Reload
        </button>
      </section>
    </main>
  );
}

function LedgerErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <main className={styles.centeredPage}>
      <Wordmark />
      <section className={styles.configurationCard}>
        <p className={styles.kicker}>Game book unavailable</p>
        <h1>We could not open your game book</h1>
        <p>{message}</p>
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => void onSignOut()}>Sign out</button>
          <button className={styles.primaryButton} type="button" onClick={() => void onRetry()}>
            <RotateCw size={16} aria-hidden="true" /> Try again
          </button>
        </div>
      </section>
    </main>
  );
}

export default function TileTallyApp() {
  const ledger = useGameLedger();
  const [tab, setTab] = useState<Tab>("games");

  if (ledger.configurationError) return <ConfigurationScreen message={ledger.configurationError} />;
  if (ledger.authLoading) return <LoadingScreen />;
  if (!ledger.session) {
    return (
      <LoginScreen
        onGoogleCredential={ledger.signInWithGoogleToken}
        onRedirectSignIn={ledger.signInWithRedirect}
        error={ledger.error}
        busy={ledger.busy}
      />
    );
  }
  if (ledger.dataLoading && ledger.games.length === 0 && ledger.entities.length === 0) return <LoadingScreen />;
  if (ledger.error && ledger.games.length === 0 && ledger.entities.length === 0) {
    return <LedgerErrorScreen message={ledger.error} onRetry={ledger.refresh} onSignOut={ledger.signOut} />;
  }

  const email = ledger.user?.email ?? "Signed in";

  return (
    <div className={styles.page}>
      <header className={styles.appHeader}>
        <div className={styles.headerInner}>
          <Wordmark />
          <div className={styles.accountBlock}>
            <span title={email}>{email}</span>
            <button className={styles.headerButton} type="button" onClick={() => void ledger.signOut()} disabled={ledger.busy}>
              <LogOut size={16} aria-hidden="true" /> <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <nav className={styles.tabBar} aria-label="Game Ledger sections">
        <div className={styles.tabInner}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              className={tab === id ? styles.activeTab : ""}
              type="button"
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {id === "games" && ledger.games.some((game) => game.status !== "complete") && <i aria-label="Open game" />}
            </button>
          ))}
        </div>
      </nav>

      <main className={`${styles.main} ${tab === "tiles" ? styles.mainWide : ""}`}>
        {ledger.dataLoading && <div className={styles.syncing}><LoaderCircle size={14} className={styles.spinner} aria-hidden="true" /> Syncing game book…</div>}
        {ledger.error && (
          <div className={styles.errorBanner} role="alert">
            <span>{ledger.error}</span>
            <button type="button" onClick={() => ledger.setError(null)} aria-label="Dismiss error"><X size={17} /></button>
          </div>
        )}

        {tab === "games" && (
          <GameLedgerView
            entities={ledger.entities}
            games={ledger.games}
            participants={ledger.participants}
            events={ledger.events}
            media={ledger.media}
            busy={ledger.busy}
            onAddEntity={ledger.addEntity}
            onStartGame={ledger.startGame}
            onAppendEvent={ledger.appendEvent}
            onVoidEvent={ledger.voidEvent}
            onFinishGame={ledger.finishGame}
            onUploadMedia={ledger.uploadMedia}
            onDeleteMedia={ledger.deleteMedia}
          />
        )}
        {tab === "tiles" && <TilesView key={ledger.session.user.id} userId={ledger.session.user.id} />}
      </main>
    </div>
  );
}
