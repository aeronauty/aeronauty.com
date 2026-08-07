"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Camera, ChevronRight, CirclePlus, Clock3, UsersRound } from "lucide-react";
import { normaliseGameProfile } from "@/lib/tiletally/gameProfiles";
import GameSession from "./GameSession";
import GameSetup from "./GameSetup";
import type {
  AppendLedgerEventInput,
  CreateLedgerGameInput,
  FinishLedgerGameInput,
  LedgerEntity,
  LedgerEvent,
  LedgerGame,
  LedgerMedia,
  LedgerParticipant,
} from "./gameLedgerTypes";
import styles from "./game-ledger.module.css";

type Props = {
  entities: LedgerEntity[];
  games: LedgerGame[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  media: LedgerMedia[];
  busy: boolean;
  onAddEntity: (name: string, entityType: string) => Promise<LedgerEntity | null>;
  onStartGame: (input: CreateLedgerGameInput) => Promise<LedgerGame | null>;
  onAppendEvent: (input: AppendLedgerEventInput) => Promise<LedgerEvent | null>;
  onVoidEvent: (gameId: string, eventId: string) => Promise<void>;
  onFinishGame: (input: FinishLedgerGameInput) => Promise<void>;
  onUploadMedia: (
    gameId: string,
    kind: "photo" | "video",
    file: File,
    capturedAt: string,
    durationSeconds?: number,
  ) => Promise<void>;
  onDeleteMedia: (media: LedgerMedia) => Promise<void>;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function workflowStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function GameLedgerView(props: Props) {
  const {
    entities,
    games,
    participants,
    events,
    media,
    busy,
    onAddEntity,
    onStartGame,
  } = props;
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [creating, setCreating] = useState(games.length === 0);

  useEffect(() => {
    if (selectedGameId && !games.some((game) => game.id === selectedGameId)) setSelectedGameId(null);
  }, [games, selectedGameId]);

  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;
  const openGames = games.filter((game) => game.status !== "complete");
  const completed = games.filter((game) => game.status === "complete");

  if (selectedGame) {
    return (
      <GameSession
        game={selectedGame}
        entities={entities}
        participants={participants.filter((participant) => participant.game_id === selectedGame.id)}
        events={events.filter((event) => event.game_id === selectedGame.id)}
        media={media.filter((item) => item.game_id === selectedGame.id)}
        busy={busy}
        onBack={() => setSelectedGameId(null)}
        onAppendEvent={props.onAppendEvent}
        onVoidEvent={props.onVoidEvent}
        onFinishGame={props.onFinishGame}
        onUploadMedia={props.onUploadMedia}
        onDeleteMedia={props.onDeleteMedia}
      />
    );
  }

  async function startGame(input: CreateLedgerGameInput) {
    const created = await onStartGame(input);
    if (created) {
      setCreating(false);
      setSelectedGameId(created.id);
    }
    return created;
  }

  return (
    <div className={styles.ledgerHome}>
      <header className={styles.ledgerHomeHeader}>
        <div>
          <p className={styles.kicker}>Private game book</p>
          <h1>Every game can keep its own shape.</h1>
          <p>Scores, state, notes, photos and short clips live together as one replayable timeline.</p>
        </div>
        {!creating && (
          <button className={styles.primaryButton} type="button" onClick={() => setCreating(true)}>
            <CirclePlus size={17} aria-hidden="true" /> New game
          </button>
        )}
      </header>

      {creating && (
        <GameSetup
          entities={entities.filter((entity) => !entity.archived_at)}
          busy={busy}
          onAddEntity={onAddEntity}
          onStartGame={startGame}
          onCancel={games.length ? () => setCreating(false) : undefined}
        />
      )}

      {!creating && games.length === 0 && (
        <section className={styles.emptyLedger}>
          <CalendarDays size={30} aria-hidden="true" />
          <h2>Your game book is empty</h2>
          <p>Create an open tally, Cribbage board, Chess journal—or define something completely your own.</p>
          <button className={styles.primaryButton} type="button" onClick={() => setCreating(true)}>Create the first game</button>
        </section>
      )}

      {!creating && openGames.length > 0 && (
        <GameGroup
          heading="Open games"
          games={openGames}
          participants={participants}
          events={events}
          media={media}
          onSelect={setSelectedGameId}
        />
      )}

      {!creating && completed.length > 0 && (
        <GameGroup
          heading="Past games"
          games={completed}
          participants={participants}
          events={events}
          media={media}
          onSelect={setSelectedGameId}
        />
      )}
    </div>
  );
}

function GameGroup({
  heading,
  games,
  participants,
  events,
  media,
  onSelect,
}: {
  heading: string;
  games: LedgerGame[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  media: LedgerMedia[];
  onSelect: (id: string) => void;
}) {
  const rows = useMemo(() => games.map((game) => ({
    game,
    profile: normaliseGameProfile(game.definition),
    players: participants.filter((participant) => participant.game_id === game.id).sort((a, b) => a.seat - b.seat),
    eventCount: events.filter((event) => event.game_id === game.id).length,
    mediaCount: media.filter((item) => item.game_id === game.id && !item.deleted_at).length,
  })), [events, games, media, participants]);

  return (
    <section className={styles.gameGroup} aria-labelledby={`game-group-${heading.replace(/\s/g, "-").toLowerCase()}`}>
      <div className={styles.gameGroupHeading}>
        <h2 id={`game-group-${heading.replace(/\s/g, "-").toLowerCase()}`}>{heading}</h2>
        <span>{games.length}</span>
      </div>
      <div className={styles.gameCardGrid}>
        {rows.map(({ game, profile, players, eventCount, mediaCount }) => (
          <button className={styles.gameCard} type="button" key={game.id} onClick={() => onSelect(game.id)}>
            <span className={game.status === "complete" ? styles.cardComplete : styles.cardLive}>
              {workflowStatusLabel(game.status)}
            </span>
            <h3>{game.title}</h3>
            <p>{profile.name}{game.location ? ` · ${game.location}` : ""}</p>
            <div className={styles.cardMeta}>
              <span><Clock3 size={14} aria-hidden="true" /> {formatDate(game.started_at)}</span>
              <span><UsersRound size={14} aria-hidden="true" /> {players.length ? players.map((player) => player.label).join(", ") : "Shared game"}</span>
              <span><CalendarDays size={14} aria-hidden="true" /> {eventCount} {eventCount === 1 ? "moment" : "moments"}</span>
              {mediaCount > 0 && <span><Camera size={14} aria-hidden="true" /> {mediaCount} media</span>}
            </div>
            <span className={styles.openGame}>Open <ChevronRight size={16} aria-hidden="true" /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
