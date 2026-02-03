/**
 * User Service - Handles user registration and profile management
 *
 * This service:
 * - Creates new users
 * - Publishes user.created events
 * - Simulates a basic user management service
 *
 * Run with: bun examples/microservices-redis/user-service.ts
 * Note: Requires Redis running on localhost:6379
 */

import { Publisher, generateMessageId } from "@pubsubjs/core";
import { RedisTransport } from "@pubsubjs/transport-redis";
import { UserEvents } from "./events.ts";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ============================================
// Service Setup
// ============================================

const transport = new RedisTransport({
  url: REDIS_URL,
  channelPrefix: "microservices",
});

const publisher = new Publisher({
  events: UserEvents,
  transport,
});

// ============================================
// User Service Logic
// ============================================

interface CreateUserInput {
  email: string;
  name: string;
}

async function createUser(input: CreateUserInput) {
  const userId = `user_${generateMessageId()}`;

  // In a real service, you would:
  // 1. Validate input
  // 2. Hash password
  // 3. Store in database
  // 4. Then publish event

  console.log(`[UserService] Creating user: ${input.name} (${input.email})`);

  // Publish event
  await publisher.publish("user.created", {
    userId,
    email: input.email,
    name: input.name,
    createdAt: Date.now(),
  });

  console.log(`[UserService] Published user.created event for ${userId}`);

  return { userId, ...input };
}

async function updateUser(userId: string, changes: { name?: string; email?: string }) {
  console.log(`[UserService] Updating user ${userId}:`, changes);

  await publisher.publish("user.updated", {
    userId,
    changes,
    updatedAt: Date.now(),
  });

  console.log(`[UserService] Published user.updated event for ${userId}`);
}

async function deleteUser(userId: string) {
  console.log(`[UserService] Deleting user ${userId}`);

  await publisher.publish("user.deleted", {
    userId,
    deletedAt: Date.now(),
  });

  console.log(`[UserService] Published user.deleted event for ${userId}`);
}

// ============================================
// Demo: Simulate User Operations
// ============================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║              User Service                         ║
╠═══════════════════════════════════════════════════╣
║  Redis: ${REDIS_URL.padEnd(41)}║
║  Channel Prefix: microservices                    ║
╚═══════════════════════════════════════════════════╝
`);

  console.log("[UserService] Connecting to Redis...");
  await publisher.connect();
  console.log("[UserService] Connected!\n");

  // Simulate user operations
  console.log("=== Simulating User Operations ===\n");

  // Create some users
  const user1 = await createUser({
    email: "alice@example.com",
    name: "Alice Johnson",
  });

  await new Promise((r) => setTimeout(r, 1000));

  const user2 = await createUser({
    email: "bob@example.com",
    name: "Bob Smith",
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Update a user
  await updateUser(user1.userId, { name: "Alice Williams" });

  await new Promise((r) => setTimeout(r, 1000));

  // Delete a user
  await deleteUser(user2.userId);

  console.log("\n[UserService] Demo complete!");
  console.log("[UserService] Service will keep running to handle more requests...");
  console.log("[UserService] Press Ctrl+C to stop.\n");

  // Keep service running
  // In a real service, you might have an HTTP API here
  setInterval(() => {
    // Heartbeat
  }, 10000);
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[UserService] Shutting down...");
  await publisher.disconnect();
  process.exit(0);
});

main().catch(console.error);
