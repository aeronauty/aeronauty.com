import { Redis } from "@upstash/redis";

const REDIS_CONFIGS = [
  ["aeronauty_storage_KV_REST_API_URL", "aeronauty_storage_KV_REST_API_TOKEN"],
  ["aeronauty_storage_UPSTASH_REDIS_REST_URL", "aeronauty_storage_UPSTASH_REDIS_REST_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const;

export function getRedisConfig(): { url: string; token: string; source: string } | null {
  for (const [urlKey, tokenKey] of REDIS_CONFIGS) {
    const url = process.env[urlKey];
    const token = process.env[tokenKey];
    if (url && token) {
      return { url, token, source: urlKey };
    }
  }

  return null;
}

export function getRedisClient(): Redis | null {
  const config = getRedisConfig();
  if (!config) return null;
  return new Redis({ url: config.url, token: config.token });
}

export function hasRedisConfig(): boolean {
  return getRedisConfig() !== null;
}
