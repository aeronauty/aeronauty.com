import "server-only";
import { getRedisClient } from "@/lib/redis-config";
import { TileTallyHttpError } from "@/lib/tiletally/http";

const PREFIX = "aeronauty:tiletally:ai:v1";
const HOUR_TTL_SECONDS = 2 * 60 * 60;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 35 * 24 * 60 * 60;

const RESERVE_SCRIPT = `
local requests = redis.call('INCR', KEYS[1])
if requests == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if requests > tonumber(ARGV[2]) then return {0, 1} end

local reserve = tonumber(ARGV[3])
local daily = tonumber(redis.call('GET', KEYS[2]) or '0')
local monthly = tonumber(redis.call('GET', KEYS[3]) or '0')
if daily + reserve > tonumber(ARGV[4]) then return {0, 2} end
if monthly + reserve > tonumber(ARGV[5]) then return {0, 3} end

daily = redis.call('INCRBY', KEYS[2], reserve)
monthly = redis.call('INCRBY', KEYS[3], reserve)
if daily == reserve then redis.call('EXPIRE', KEYS[2], ARGV[6]) end
if monthly == reserve then redis.call('EXPIRE', KEYS[3], ARGV[7]) end
return {1, 0, daily, monthly}
`;

const RECONCILE_SCRIPT = `
local delta = tonumber(ARGV[1]) - tonumber(ARGV[2])
local daily = redis.call('INCRBY', KEYS[1], delta)
local monthly = redis.call('INCRBY', KEYS[2], delta)
if daily < 0 then redis.call('SET', KEYS[1], 0, 'KEEPTTL'); daily = 0 end
if monthly < 0 then redis.call('SET', KEYS[2], 0, 'KEEPTTL'); monthly = 0 end
return {daily, monthly}
`;

type BudgetConfig = {
  requestsPerHour: number;
  dailyTokenCap: number;
  monthlyTokenCap: number;
};

export type AiBudgetReservation = {
  dailyKey: string;
  monthlyKey: string;
  reservedTokens: number;
  backend: "redis" | "memory";
};

type MemoryWindow = { stamp: string; value: number };
const memoryRequests = new Map<string, MemoryWindow>();
const memoryDaily = new Map<string, MemoryWindow>();
const memoryMonthly = new Map<string, MemoryWindow>();

function readBoundedInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function getAiBudgetConfig(): BudgetConfig {
  return {
    requestsPerHour: readBoundedInt("TILETALLY_AI_REQUESTS_PER_HOUR", 20, 1, 1_000),
    dailyTokenCap: readBoundedInt("TILETALLY_AI_DAILY_TOKEN_CAP", 50_000, 1_000, 10_000_000),
    monthlyTokenCap: readBoundedInt(
      "TILETALLY_AI_MONTHLY_TOKEN_CAP",
      500_000,
      1_000,
      100_000_000
    ),
  };
}

function stamps(now = new Date()) {
  const iso = now.toISOString();
  return {
    hour: iso.slice(0, 13),
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
  };
}

function memoryIncrement(
  store: Map<string, MemoryWindow>,
  key: string,
  stamp: string,
  increment: number
): number {
  const current = store.get(key);
  const value = current?.stamp === stamp ? current.value + increment : increment;
  store.set(key, { stamp, value: Math.max(0, value) });
  return Math.max(0, value);
}

function reserveInMemory(userId: string, reserveTokens: number): AiBudgetReservation {
  const config = getAiBudgetConfig();
  const current = stamps();
  const hourly = memoryIncrement(memoryRequests, userId, current.hour, 1);
  if (hourly > config.requestsPerHour) {
    throw new TileTallyHttpError(429, "hourly_ai_limit", "Too many AI requests. Try again later.");
  }

  const dailyCurrent = memoryDaily.get(userId);
  const monthlyCurrent = memoryMonthly.get(userId);
  const daily = dailyCurrent?.stamp === current.day ? dailyCurrent.value : 0;
  const monthly = monthlyCurrent?.stamp === current.month ? monthlyCurrent.value : 0;
  if (daily + reserveTokens > config.dailyTokenCap) {
    throw new TileTallyHttpError(429, "daily_ai_limit", "Today's Tile Tally AI limit is reached.");
  }
  if (monthly + reserveTokens > config.monthlyTokenCap) {
    throw new TileTallyHttpError(429, "monthly_ai_limit", "This month's Tile Tally AI limit is reached.");
  }

  memoryIncrement(memoryDaily, userId, current.day, reserveTokens);
  memoryIncrement(memoryMonthly, userId, current.month, reserveTokens);
  return {
    dailyKey: `${userId}:${current.day}`,
    monthlyKey: `${userId}:${current.month}`,
    reservedTokens: reserveTokens,
    backend: "memory",
  };
}

export async function reserveAiBudget(
  userId: string,
  requestedTokens: number
): Promise<AiBudgetReservation> {
  const reserveTokens = Math.max(1, Math.ceil(requestedTokens));
  const redis = getRedisClient();
  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      throw new TileTallyHttpError(
        503,
        "ai_limiter_unavailable",
        "Tile Tally AI is temporarily unavailable."
      );
    }
    return reserveInMemory(userId, reserveTokens);
  }

  const config = getAiBudgetConfig();
  const current = stamps();
  const hourlyKey = `${PREFIX}:requests:${userId}:${current.hour}`;
  const dailyKey = `${PREFIX}:tokens:day:${userId}:${current.day}`;
  const monthlyKey = `${PREFIX}:tokens:month:${userId}:${current.month}`;

  let result: number[];
  try {
    result = await redis.eval<string[], number[]>(
      RESERVE_SCRIPT,
      [hourlyKey, dailyKey, monthlyKey],
      [
        String(HOUR_TTL_SECONDS),
        String(config.requestsPerHour),
        String(reserveTokens),
        String(config.dailyTokenCap),
        String(config.monthlyTokenCap),
        String(DAY_TTL_SECONDS),
        String(MONTH_TTL_SECONDS),
      ]
    );
  } catch {
    throw new TileTallyHttpError(
      503,
      "ai_limiter_unavailable",
      "Tile Tally AI is temporarily unavailable."
    );
  }

  if (Number(result[0]) !== 1) {
    const reason = Number(result[1]);
    if (reason === 1) {
      throw new TileTallyHttpError(429, "hourly_ai_limit", "Too many AI requests. Try again later.");
    }
    if (reason === 2) {
      throw new TileTallyHttpError(429, "daily_ai_limit", "Today's Tile Tally AI limit is reached.");
    }
    throw new TileTallyHttpError(
      429,
      "monthly_ai_limit",
      "This month's Tile Tally AI limit is reached."
    );
  }

  return { dailyKey, monthlyKey, reservedTokens: reserveTokens, backend: "redis" };
}

export async function reconcileAiBudget(
  reservation: AiBudgetReservation,
  actualTokens: number
): Promise<void> {
  const actual = Math.max(0, Math.ceil(actualTokens));
  if (reservation.backend === "memory") {
    const dailySplit = reservation.dailyKey.split(":");
    const monthlySplit = reservation.monthlyKey.split(":");
    const userId = dailySplit[0];
    memoryIncrement(
      memoryDaily,
      userId,
      dailySplit.slice(1).join(":"),
      actual - reservation.reservedTokens
    );
    memoryIncrement(
      memoryMonthly,
      userId,
      monthlySplit.slice(1).join(":"),
      actual - reservation.reservedTokens
    );
    return;
  }

  const redis = getRedisClient();
  if (!redis) return; // The worst-case reservation remains charged.
  try {
    await redis.eval<string[], number[]>(
      RECONCILE_SCRIPT,
      [reservation.dailyKey, reservation.monthlyKey],
      [String(actual), String(reservation.reservedTokens)]
    );
  } catch {
    // Fail safe: retaining the larger reservation cannot let a user exceed a cap.
    console.error("[tile-tally:ai-budget-reconcile] unavailable");
  }
}
