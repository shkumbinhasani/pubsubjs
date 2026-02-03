/**
 * Shared event definitions for SSE notifications
 */

import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

// Server -> Client notifications (via SSE)
export const NotificationEvents = defineEvent([
  {
    name: "notification.info",
    schema: z.object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "notification.success",
    schema: z.object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "notification.warning",
    schema: z.object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "notification.error",
    schema: z.object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "notification.progress",
    schema: z.object({
      id: z.string(),
      title: z.string(),
      progress: z.number().int().min(0).max(100),
      status: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "system.announcement",
    schema: z.object({
      id: z.string(),
      message: z.string(),
      priority: z.enum(["low", "medium", "high"]),
      timestamp: z.number(),
    }),
  },
  {
    name: "user.activity",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      action: z.string(),
      timestamp: z.number(),
    }),
  },
]);
