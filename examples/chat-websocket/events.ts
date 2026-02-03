/**
 * Shared event definitions for the chat application
 * This file can be shared between client and server
 */

import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

// ============================================
// Client -> Server Events
// ============================================

export const ClientEvents = defineEvent([
  {
    name: "auth.login",
    schema: z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).max(100).optional(),
    }),
  },
  {
    name: "auth.logout",
    schema: z.object({}),
  },
  {
    name: "room.create",
    schema: z.object({
      roomId: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }),
  },
  {
    name: "room.list",
    schema: z.object({}),
  },
  {
    name: "room.join",
    schema: z.object({
      roomId: z.string().min(1),
      username: z.string().min(1).max(50),
    }),
  },
  {
    name: "room.leave",
    schema: z.object({
      roomId: z.string().min(1),
    }),
  },
  {
    name: "message.send",
    schema: z.object({
      text: z.string().min(1).max(2000),
      roomId: z.string().min(1),
    }),
  },
  {
    name: "message.history",
    schema: z.object({
      roomId: z.string().min(1),
      limit: z.number().min(1).max(100).optional(),
      before: z.number().optional(),
    }),
  },
  {
    name: "typing.start",
    schema: z.object({
      roomId: z.string().min(1),
    }),
  },
  {
    name: "typing.stop",
    schema: z.object({
      roomId: z.string().min(1),
    }),
  },
  {
    name: "presence.update",
    schema: z.object({
      status: z.enum(["online", "away", "dnd"]),
    }),
  },
]);

// ============================================
// Server -> Client Events
// ============================================

const MessageSchema = z.object({
  id: z.string(),
  text: z.string(),
  username: z.string(),
  timestamp: z.number(),
});

const RoomInfoSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  userCount: z.number(),
  createdAt: z.number(),
});

export const ServerEvents = defineEvent([
  {
    name: "auth.success",
    schema: z.object({
      username: z.string(),
      userId: z.string(),
    }),
  },
  {
    name: "auth.error",
    schema: z.object({
      code: z.string(),
      message: z.string(),
    }),
  },
  {
    name: "room.created",
    schema: z.object({
      roomId: z.string(),
      description: z.string().optional(),
      createdBy: z.string(),
    }),
  },
  {
    name: "room.list",
    schema: z.object({
      rooms: z.array(RoomInfoSchema),
    }),
  },
  {
    name: "room.joined",
    schema: z.object({
      roomId: z.string(),
      users: z.array(z.string()),
      recentMessages: z.array(MessageSchema),
    }),
  },
  {
    name: "room.userJoined",
    schema: z.object({
      roomId: z.string(),
      username: z.string(),
    }),
  },
  {
    name: "room.userLeft",
    schema: z.object({
      roomId: z.string(),
      username: z.string(),
    }),
  },
  {
    name: "message.received",
    schema: z.object({
      id: z.string(),
      text: z.string(),
      roomId: z.string(),
      username: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "message.history",
    schema: z.object({
      roomId: z.string(),
      messages: z.array(MessageSchema),
      hasMore: z.boolean(),
    }),
  },
  {
    name: "typing.update",
    schema: z.object({
      roomId: z.string(),
      usersTyping: z.array(z.string()),
    }),
  },
  {
    name: "presence.update",
    schema: z.object({
      username: z.string(),
      status: z.enum(["online", "away", "dnd", "offline"]),
      lastSeen: z.number().optional(),
    }),
  },
  {
    name: "rateLimit.warning",
    schema: z.object({
      remaining: z.number(),
      resetTime: z.number(),
      message: z.string(),
    }),
  },
  {
    name: "error",
    schema: z.object({
      code: z.string(),
      message: z.string(),
    }),
  },
]);

export type ClientEventNames = keyof typeof ClientEvents;
export type ServerEventNames = keyof typeof ServerEvents;
