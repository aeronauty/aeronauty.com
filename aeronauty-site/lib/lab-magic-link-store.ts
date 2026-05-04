import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const MAGIC_LINK_MAX_CLICKS = 3;

type StoredMagicLink = {
  email: string;
  clicks: number;
  expiresAt: number;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hasMagicLinkStore(): boolean {
  return hasRedisConfig();
}

export async function storeMagicLink(id: string, email: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  await redis.set(
    `lab:magic-link:${id}`,
    {
      email: normalizeEmail(email),
      clicks: 0,
      expiresAt: Date.now() + MAGIC_LINK_TTL_SECONDS * 1000,
    } satisfies StoredMagicLink,
    { ex: MAGIC_LINK_TTL_SECONDS }
  );
}

export async function consumeMagicLinkClick(id: string, email: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;

  const key = `lab:magic-link:${id}`;
  const normalizedEmail = normalizeEmail(email);
  const stored = await redis.get<StoredMagicLink>(key);

  if (!stored || normalizeEmail(stored.email) !== normalizedEmail) {
    return false;
  }

  const remainingSeconds = Math.ceil((stored.expiresAt - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    await redis.del(key);
    return false;
  }

  if (stored.clicks >= MAGIC_LINK_MAX_CLICKS) {
    await redis.del(key);
    return false;
  }

  await redis.set(
    key,
    { email: normalizedEmail, clicks: stored.clicks + 1, expiresAt: stored.expiresAt },
    { ex: remainingSeconds }
  );
  return true;
}
