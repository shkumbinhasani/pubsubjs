/**
 * Event definitions for the real-time dashboard
 */

import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

// Dashboard events
export const DashboardEvents = defineEvent([
  {
    name: "metrics.update",
    schema: z.object({
      activeUsers: z.number().int().nonnegative(),
      ordersToday: z.number().int().nonnegative(),
      revenue: z.number().nonnegative(),
      errorRate: z.number().min(0).max(100),
      requestsPerSecond: z.number().nonnegative(),
      avgResponseTime: z.number().nonnegative(),
      cpuUsage: z.number().min(0).max(100),
      memoryUsage: z.number().min(0).max(100),
    }),
  },
  {
    name: "chart.datapoint",
    schema: z.object({
      timestamp: z.number(),
      value: z.number(),
      chartId: z.enum(["requests", "revenue", "errors", "users"]),
    }),
  },
  {
    name: "user.online",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      avatar: z.string().optional(),
      role: z.enum(["admin", "user", "guest"]).default("user"),
      location: z.string().optional(),
    }),
  },
  {
    name: "user.offline",
    schema: z.object({
      userId: z.string(),
    }),
  },
  {
    name: "user.status.change",
    schema: z.object({
      userId: z.string(),
      status: z.enum(["online", "away", "busy"]),
    }),
  },
  {
    name: "activity.new",
    schema: z.object({
      id: z.string(),
      type: z.enum(["user", "order", "error", "system", "alert"]),
      title: z.string(),
      description: z.string().optional(),
      timestamp: z.number(),
      metadata: z.record(z.unknown()).optional(),
    }),
  },
  {
    name: "alert.trigger",
    schema: z.object({
      id: z.string(),
      severity: z.enum(["info", "warning", "critical"]),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
      source: z.string().optional(),
    }),
  },
  {
    name: "alert.dismiss",
    schema: z.object({
      id: z.string(),
      dismissedBy: z.string().optional(),
    }),
  },
  {
    name: "time.range.change",
    schema: z.object({
      range: z.enum(["5min", "1hour", "24hours", "7days"]),
    }),
  },
]);

export type DashboardEventTypes = typeof DashboardEvents;
export type MetricData = z.infer<typeof DashboardEvents["metrics.update"]["schema"]>;
export type ChartDatapoint = z.infer<typeof DashboardEvents["chart.datapoint"]["schema"]>;
export type OnlineUser = z.infer<typeof DashboardEvents["user.online"]["schema"]>;
export type Activity = z.infer<typeof DashboardEvents["activity.new"]["schema"]>;
export type Alert = z.infer<typeof DashboardEvents["alert.trigger"]["schema"]>;
export type TimeRange = z.infer<typeof DashboardEvents["time.range.change"]["schema"]>["range"];
