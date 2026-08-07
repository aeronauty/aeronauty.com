import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import type { ParsedListGamesFilter } from "@/lib/tiletally/schemas";
import type {
  TileTallyGameStatus,
  TileTallyListedGame,
  TileTallyTurnKind,
} from "@/lib/tiletally/types";

const MAX_TOOL_TURNS = 2_000;

type GameRow = {
  id: string;
  played_on: string;
  location: string | null;
  status: TileTallyGameStatus;
  completed_at: string | null;
};

type GamePlayerRow = { game_id: string; player_id: string; seat: number };
type PlayerRow = { id: string; name: string };
type TurnRow = {
  game_id: string;
  player_id: string;
  seq: number;
  score: number;
  word: string | null;
  is_bingo: boolean;
  kind: TileTallyTurnKind;
};

export type TileTallyListGamesResult = {
  games: TileTallyListedGame[];
  turns_truncated: boolean;
};

function unavailable(): TileTallyHttpError {
  return new TileTallyHttpError(
    502,
    "game_data_unavailable",
    "Tile Tally game data is temporarily unavailable."
  );
}

/** Reads only caller-owned rows because the supplied client carries the user's JWT. */
export async function listGamesForTileTally(
  client: SupabaseClient,
  filter: ParsedListGamesFilter
): Promise<TileTallyListGamesResult> {
  const fetchLimit = filter.player ? Math.min(filter.limit * 5, 100) : filter.limit;
  let gameQuery = client
    .from("tiletally_games")
    .select("id,played_on,location,status,completed_at")
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (filter.played_from) gameQuery = gameQuery.gte("played_on", filter.played_from);
  if (filter.played_to) gameQuery = gameQuery.lte("played_on", filter.played_to);
  if (filter.status) gameQuery = gameQuery.eq("status", filter.status);

  const { data: gameData, error: gameError } = await gameQuery;
  if (gameError) throw unavailable();
  const games = (gameData ?? []) as GameRow[];
  if (games.length === 0) return { games: [], turns_truncated: false };

  const gameIds = games.map((game) => game.id);
  const [membersResponse, turnsResponse] = await Promise.all([
    client
      .from("tiletally_game_players")
      .select("game_id,player_id,seat")
      .in("game_id", gameIds)
      .order("seat", { ascending: true }),
    client
      .from("tiletally_turns")
      .select("game_id,player_id,seq,score,word,is_bingo,kind", { count: "exact" })
      .in("game_id", gameIds)
      .order("seq", { ascending: true })
      .limit(MAX_TOOL_TURNS),
  ]);
  if (membersResponse.error || turnsResponse.error) throw unavailable();

  const members = (membersResponse.data ?? []) as GamePlayerRow[];
  const turns = (turnsResponse.data ?? []) as TurnRow[];
  const playerIds = Array.from(
    new Set([...members.map((member) => member.player_id), ...turns.map((turn) => turn.player_id)])
  );

  const { data: playerData, error: playerError } = playerIds.length
    ? await client.from("tiletally_players").select("id,name").in("id", playerIds)
    : { data: [] as PlayerRow[], error: null };
  if (playerError) throw unavailable();

  const playerNames = new Map(
    ((playerData ?? []) as PlayerRow[]).map((player) => [player.id, player.name])
  );
  const membersByGame = new Map<string, GamePlayerRow[]>();
  const turnsByGame = new Map<string, TurnRow[]>();
  for (const member of members) {
    const rows = membersByGame.get(member.game_id) ?? [];
    rows.push(member);
    membersByGame.set(member.game_id, rows);
  }
  for (const turn of turns) {
    const rows = turnsByGame.get(turn.game_id) ?? [];
    rows.push(turn);
    turnsByGame.set(turn.game_id, rows);
  }

  const requestedPlayer = filter.player?.toLowerCase();
  const listed = games
    .map((game): TileTallyListedGame => {
      const gameTurns = turnsByGame.get(game.id) ?? [];
      const gameMembers = membersByGame.get(game.id) ?? [];
      const totalByPlayer = new Map<string, number>();
      for (const member of gameMembers) totalByPlayer.set(member.player_id, 0);
      for (const turn of gameTurns) {
        totalByPlayer.set(turn.player_id, (totalByPlayer.get(turn.player_id) ?? 0) + turn.score);
      }

      const participantIds =
        gameMembers.length > 0
          ? gameMembers.map((member) => member.player_id)
          : Array.from(new Set(gameTurns.map((turn) => turn.player_id)));

      return {
        id: game.id,
        played_on: game.played_on,
        location: game.location,
        status: game.status,
        completed_at: game.completed_at,
        players: participantIds.map((playerId) => ({
          id: playerId,
          name: playerNames.get(playerId) ?? "Unknown player",
          total: totalByPlayer.get(playerId) ?? 0,
        })),
        turns: gameTurns.map((turn) => ({
          seq: turn.seq,
          player: playerNames.get(turn.player_id) ?? "Unknown player",
          score: turn.score,
          word: turn.word,
          is_bingo: turn.is_bingo,
          kind: turn.kind,
        })),
      };
    })
    .filter(
      (game) =>
        !requestedPlayer ||
        game.players.some((player) => player.name.toLowerCase() === requestedPlayer)
    )
    .slice(0, filter.limit);

  return {
    games: listed,
    turns_truncated: (turnsResponse.count ?? turns.length) > turns.length,
  };
}
