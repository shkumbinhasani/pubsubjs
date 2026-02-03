/**
 * Server configuration
 */
export const config = {
  serverId: `server-${crypto.randomUUID().slice(0, 8)}`,
  port: parseInt(process.env.PORT || "3000"),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
} as const;
