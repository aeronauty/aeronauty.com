import type { Game, GamePlayer, Player, Turn } from "./types";

export function formatScore(score: number) {
  return score > 0 ? `+${score}` : String(score);
}

export function formatPlayedOn(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function turnsForGame(turns: Turn[], gameId: string) {
  return turns.filter((turn) => turn.game_id === gameId).sort((a, b) => a.seq - b.seq);
}

export function playerIdsForGame(game: Game, turns: Turn[], players: Player[], gamePlayers: GamePlayer[] = []) {
  const seated = gamePlayers
    .filter((row) => row.game_id === game.id)
    .sort((a, b) => a.seat - b.seat)
    .map((row) => row.player_id);
  if (seated.length) return seated;
  const detail = game.source_detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const candidate = (detail as Record<string, unknown>).player_ids;
    if (Array.isArray(candidate)) {
      const ids = candidate.filter((value): value is string => typeof value === "string");
      if (ids.length) return ids;
    }
  }
  const fromTurns = Array.from(
    new Set(turns.filter((turn) => turn.game_id === game.id).map((turn) => turn.player_id)),
  );
  return fromTurns.length ? fromTurns : players.map((player) => player.id);
}

export function gameTotals(gameId: string, turns: Turn[]) {
  const totals = new Map<string, number>();
  turns.forEach((turn) => {
    if (turn.game_id !== gameId) return;
    totals.set(turn.player_id, (totals.get(turn.player_id) ?? 0) + turn.score);
  });
  return totals;
}

export function winnerIds(gameId: string, turns: Turn[]) {
  const totals = gameTotals(gameId, turns);
  if (!totals.size) return [];
  const high = Math.max(...Array.from(totals.values()));
  return Array.from(totals.entries()).filter(([, total]) => total === high).map(([playerId]) => playerId);
}

export function sourceLabel(source: string) {
  switch (source) {
    case "chat":
      return "Chat";
    case "voice":
      return "Voice";
    case "photo":
      return "Photo";
    default:
      return "Manual";
  }
}
