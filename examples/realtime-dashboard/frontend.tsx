/**
 * Real-time Dashboard Frontend
 *
 * A comprehensive real-time analytics dashboard with:
 * - Multiple chart types (line, bar, pie)
 * - User presence tracking with visual indicators
 * - Real-time activity feed
 * - Alert system with severity levels
 * - Time-range selection
 * - Data aggregation and downsampling
 *
 * NEW: Showcases @pubsubjs/core Subscriber Middleware features:
 * - Rate limiting to prevent UI overload from too many updates
 * - Timing middleware for performance monitoring
 * - Idempotency middleware to skip duplicate messages
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import type { MetricData, OnlineUser, Activity, Alert, ChartDatapoint, TimeRange } from "./events.ts";
import { DashboardEvents } from "./events.ts";
import {
  Subscriber,
  BaseTransport,
  createSubscriberTimingMiddleware,
  createRateLimitMiddleware,
  createIdempotencyMiddleware,
  generateMessageId,
  type SubscribeMiddleware,
  type BaseContext,
  type TransportCapabilities,
  type TransportMessageHandler,
  type TransportPublishOptions,
  type UnsubscribeFn,
} from "@pubsubjs/core";

// ============================================
// Types
// ============================================

type ChartType = "line" | "bar" | "pie";

interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  data: ChartDatapoint[];
  color: string;
}

/**
 * Performance statistics tracked by middleware
 */
interface PerformanceStats {
  /** Total events received */
  eventsReceived: number;
  /** Events that were rate-limited (dropped) */
  eventsRateLimited: number;
  /** Events that were duplicates (skipped by idempotency) */
  eventsDeduplicated: number;
  /** Average handler duration in ms */
  avgHandlerDuration: number;
  /** Recent handler timings for calculating average */
  recentTimings: number[];
  /** Events per second (calculated) */
  eventsPerSecond: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ============================================
// Custom Transport for Dashboard Server
// ============================================

/**
 * Custom WebSocket transport that works with the dashboard server's
 * { event, payload } message format instead of the pubsub wire format.
 *
 * This demonstrates how to integrate @pubsubjs/core with existing servers
 * that use different message formats.
 */
class DashboardWebSocketTransport extends BaseTransport {
  readonly id = "dashboard-ws-transport";
  readonly capabilities: TransportCapabilities = {
    canSubscribe: true,
    canPublish: true,
    bidirectional: true,
    supportsTargeting: false,
    supportsChannels: true,
  };

  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly channelHandlers = new Map<string, Set<TransportMessageHandler>>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private isManuallyDisconnected = false;

  constructor(url: string) {
    super();
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this._state === "connected") return;

    this.setState("connecting");
    this.isManuallyDisconnected = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setState("connected");
          this.emit("connected", undefined);
          resolve();
        };

        this.ws.onclose = () => {
          this.ws = null;
          if (!this.isManuallyDisconnected) {
            this.handleDisconnect();
          } else {
            this.setState("disconnected");
            this.emit("disconnected", undefined);
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error("WebSocket error");
          this.emit("error", error);
          if (this._state === "connecting") {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };
      } catch (error) {
        this.setState("error");
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState("disconnected");
    this.emit("disconnected", undefined);
  }

  protected async doSubscribe(
    channel: string,
    handler: TransportMessageHandler
  ): Promise<UnsubscribeFn> {
    let handlers = this.channelHandlers.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        this.channelHandlers.delete(channel);
      }
    };
  }

  protected async doPublish(
    channel: string,
    payload: unknown,
    _options?: TransportPublishOptions
  ): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send in the server's expected format: { event, payload }
      this.ws.send(JSON.stringify({ event: channel, payload }));
    }
  }

  private handleRawMessage(data: string | ArrayBuffer | Blob): void {
    try {
      const text = typeof data === "string" ? data : data.toString();
      // Parse server's { event, payload } format
      const message = JSON.parse(text) as { event: string; payload: unknown };

      if (message.event) {
        const handlers = this.channelHandlers.get(message.event);
        if (handlers) {
          const transportMessage = {
            channel: message.event,
            payload: message.payload,
            messageId: generateMessageId(),
          };

          for (const handler of handlers) {
            try {
              handler(transportMessage);
            } catch (error) {
              console.error("Error in message handler:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState("disconnected");
      this.emit("disconnected", undefined);
      return;
    }

    this.setState("reconnecting");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    setTimeout(async () => {
      if (this.isManuallyDisconnected) return;

      try {
        await this.connect();
      } catch {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setState("disconnected");
          this.emit("disconnected", undefined);
        }
      }
    }, delay);
  }
}

// ============================================
// WebSocket Hook with Subscriber Middleware
// ============================================

/**
 * Configuration for the subscriber middleware
 */
const MIDDLEWARE_CONFIG = {
  /** Maximum events per second before rate limiting kicks in */
  maxEventsPerSecond: 50,
  /** Window size for rate limiting in ms */
  rateLimitWindowMs: 1000,
  /** How many recent timings to keep for averaging */
  maxRecentTimings: 100,
};

/**
 * Custom hook that uses @pubsubjs/core Subscriber with middleware
 *
 * This demonstrates the new subscriber middleware feature:
 * - Rate limiting to prevent UI overload
 * - Timing middleware for performance monitoring
 * - Idempotency to skip duplicate messages
 */
function usePubSubSubscriber(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [metrics, setMetrics] = useState<MetricData>({
    activeUsers: 0,
    ordersToday: 0,
    revenue: 0,
    errorRate: 0,
    requestsPerSecond: 0,
    avgResponseTime: 0,
    cpuUsage: 0,
    memoryUsage: 0,
  });
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chartData, setChartData] = useState<Record<string, ChartDatapoint[]>>({
    requests: [],
    revenue: [],
    errors: [],
    users: [],
  });

  // Performance stats tracked by middleware
  const [perfStats, setPerfStats] = useState<PerformanceStats>({
    eventsReceived: 0,
    eventsRateLimited: 0,
    eventsDeduplicated: 0,
    avgHandlerDuration: 0,
    recentTimings: [],
    eventsPerSecond: 0,
    lastUpdated: Date.now(),
  });

  // Refs for tracking stats without triggering re-renders
  const statsRef = useRef({
    eventsReceived: 0,
    eventsRateLimited: 0,
    eventsDeduplicated: 0,
    recentTimings: [] as number[],
    eventTimestamps: [] as number[],
  });

  // Set of processed message IDs for idempotency
  const processedMessagesRef = useRef(new Set<string>());

  const subscriberRef = useRef<Subscriber<typeof DashboardEvents> | null>(null);
  const transportRef = useRef<DashboardWebSocketTransport | null>(null);

  // Update performance stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = statsRef.current;
      const now = Date.now();

      // Calculate events per second (events in last second)
      const recentEvents = stats.eventTimestamps.filter((t) => now - t < 1000);
      stats.eventTimestamps = recentEvents;

      // Calculate average handler duration
      const avgDuration =
        stats.recentTimings.length > 0
          ? stats.recentTimings.reduce((a, b) => a + b, 0) / stats.recentTimings.length
          : 0;

      setPerfStats({
        eventsReceived: stats.eventsReceived,
        eventsRateLimited: stats.eventsRateLimited,
        eventsDeduplicated: stats.eventsDeduplicated,
        avgHandlerDuration: avgDuration,
        recentTimings: [...stats.recentTimings],
        eventsPerSecond: recentEvents.length,
        lastUpdated: now,
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Create custom transport that works with the dashboard server's message format
    const transport = new DashboardWebSocketTransport(url);
    transportRef.current = transport;

    // Create timing middleware - tracks handler duration
    const timingMiddleware = createSubscriberTimingMiddleware<typeof DashboardEvents>(
      (eventName, durationMs) => {
        const stats = statsRef.current;
        stats.recentTimings.push(durationMs);
        if (stats.recentTimings.length > MIDDLEWARE_CONFIG.maxRecentTimings) {
          stats.recentTimings.shift();
        }
      }
    );

    // Create rate limiting middleware - prevents UI overload
    const rateLimitMiddleware = createRateLimitMiddleware<typeof DashboardEvents>({
      maxEvents: MIDDLEWARE_CONFIG.maxEventsPerSecond,
      windowMs: MIDDLEWARE_CONFIG.rateLimitWindowMs,
      onLimit: (eventName, _payload) => {
        statsRef.current.eventsRateLimited++;
        console.log(`[Rate Limited] Event ${eventName} dropped due to rate limiting`);
      },
    });

    // Create idempotency middleware - skips duplicate messages
    const idempotencyMiddleware = createIdempotencyMiddleware<typeof DashboardEvents>({
      hasProcessed: (messageId) => {
        const processed = processedMessagesRef.current.has(messageId);
        if (processed) {
          statsRef.current.eventsDeduplicated++;
        }
        return processed;
      },
      markProcessed: (messageId) => {
        processedMessagesRef.current.add(messageId);
        // Limit the size of the processed set to prevent memory leaks
        if (processedMessagesRef.current.size > 10000) {
          const entries = Array.from(processedMessagesRef.current);
          processedMessagesRef.current = new Set(entries.slice(-5000));
        }
      },
    });

    // Custom middleware to track total events received
    const countingMiddleware: SubscribeMiddleware<typeof DashboardEvents, BaseContext> = async (
      _eventName,
      _payload,
      _context,
      next
    ) => {
      statsRef.current.eventsReceived++;
      statsRef.current.eventTimestamps.push(Date.now());
      await next();
    };

    // Create subscriber with middleware chain
    // Order matters: counting -> idempotency -> rate limiting -> timing -> handler
    const subscriber = new Subscriber({
      events: DashboardEvents,
      transport,
      middleware: [
        countingMiddleware,
        idempotencyMiddleware,
        rateLimitMiddleware,
        timingMiddleware,
      ],
      onError: (error, eventName, payload) => {
        console.error(`[PubSub Error] Failed to handle ${eventName}:`, error, payload);
      },
    });
    subscriberRef.current = subscriber;

    // Register event handlers
    subscriber.on("metrics.update", (payload) => {
      setMetrics(payload);
    });

    subscriber.on("user.online", (payload) => {
      setOnlineUsers((prev) => {
        const exists = prev.find((u) => u.userId === payload.userId);
        if (exists) return prev;
        return [...prev, payload];
      });
    });

    subscriber.on("user.offline", (payload) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
    });

    subscriber.on("user.status.change", (payload) => {
      setOnlineUsers((prev) =>
        prev.map((u) => (u.userId === payload.userId ? { ...u, status: payload.status } : u))
      );
    });

    subscriber.on("activity.new", (payload) => {
      setActivities((prev) => [payload, ...prev].slice(0, 50));
    });

    subscriber.on("alert.trigger", (payload) => {
      setAlerts((prev) => [...prev, payload]);
    });

    subscriber.on("alert.dismiss", (payload) => {
      setAlerts((prev) => prev.filter((a) => a.id !== payload.id));
    });

    subscriber.on("chart.datapoint", (payload) => {
      setChartData((prev) => ({
        ...prev,
        [payload.chartId]: [...(prev[payload.chartId] || []), payload].slice(-60),
      }));
    });

    subscriber.on("time.range.change", (payload) => {
      console.log("[PubSub] Time range changed to:", payload.range);
    });

    // Start subscribing
    subscriber.subscribe().then(() => {
      setIsConnected(true);
      console.log("[PubSub] Subscriber connected with middleware:");
      console.log("  - Timing middleware (performance monitoring)");
      console.log("  - Rate limiting middleware (max", MIDDLEWARE_CONFIG.maxEventsPerSecond, "events/sec)");
      console.log("  - Idempotency middleware (skip duplicates)");
    });

    // Monitor connection state
    transport.on("connected", () => {
      setIsConnected(true);
    });

    transport.on("disconnected", () => {
      setIsConnected(false);
    });

    return () => {
      subscriber.unsubscribe();
      transport.disconnect();
    };
  }, [url]);

  const send = useCallback((event: string, payload: unknown) => {
    // Use the transport's publish method which sends in the server's expected format
    const transport = transportRef.current;
    if (transport && transport.state === "connected") {
      transport.publish(event, payload);
    }
  }, []);

  return { isConnected, metrics, onlineUsers, activities, alerts, chartData, perfStats, send };
}

// ============================================
// Chart Components
// ============================================

function LineChart({ data, color, height = 200 }: { data: ChartDatapoint[]; color: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const chartHeight = rect.height - 30;

    ctx.clearRect(0, 0, width, rect.height);

    const values = data.map((d) => d.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    // Draw grid
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((point, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const y = chartHeight - ((point.value - min) / range) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Draw area under line
    ctx.fillStyle = color + "20";
    ctx.lineTo(width, chartHeight);
    ctx.lineTo(0, chartHeight);
    ctx.closePath();
    ctx.fill();

    // Draw current value
    const lastValue = data[data.length - 1]?.value || 0;
    ctx.fillStyle = "#fff";
    ctx.font = "12px system-ui";
    ctx.fillText(lastValue.toFixed(1), 10, 20);
  }, [data, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: `${height}px` }}
    />
  );
}

function BarChart({ data, color, height = 200 }: { data: ChartDatapoint[]; color: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ height: `${height}px`, display: "flex", alignItems: "flex-end", gap: "2px", paddingTop: "20px" }}>
      {data.slice(-30).map((point, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(point.value / max) * 100}%`,
            backgroundColor: color,
            borderRadius: "2px 2px 0 0",
            minHeight: "4px",
            transition: "height 0.3s ease",
          }}
          title={`${point.value.toFixed(1)}`}
        />
      ))}
    </div>
  );
}

function PieChart({ data, height = 200 }: { data: { label: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", height: `${height}px` }}>
      <svg width={height} height={height} viewBox={`0 0 ${height} ${height}`}>
        {data.map((slice, i) => {
          const angle = (slice.value / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          const endAngle = currentAngle;

          const x1 = height / 2 + (height / 2 - 10) * Math.cos((startAngle * Math.PI) / 180);
          const y1 = height / 2 + (height / 2 - 10) * Math.sin((startAngle * Math.PI) / 180);
          const x2 = height / 2 + (height / 2 - 10) * Math.cos((endAngle * Math.PI) / 180);
          const y2 = height / 2 + (height / 2 - 10) * Math.sin((endAngle * Math.PI) / 180);

          const largeArc = angle > 180 ? 1 : 0;

          return (
            <path
              key={i}
              d={`M ${height / 2} ${height / 2} L ${x1} ${y1} A ${height / 2 - 10} ${height / 2 - 10} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={slice.color}
              stroke="#16213e"
              strokeWidth="2"
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: d.color,
                borderRadius: "2px",
              }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>
              {d.label}: {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Widget Components
// ============================================

function MetricCard({
  title,
  value,
  format = "number",
  change,
  icon,
}: {
  title: string;
  value: number;
  format?: "number" | "currency" | "percent" | "time";
  change?: number;
  icon?: string;
}) {
  const formattedValue = useMemo(() => {
    switch (format) {
      case "currency":
        return `$${value.toLocaleString()}`;
      case "percent":
        return `${value.toFixed(2)}%`;
      case "time":
        return `${value.toFixed(0)}ms`;
      default:
        return value.toLocaleString();
    }
  }, [value, format]);

  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-icon">{icon}</span>
        <span className="metric-title">{title}</span>
      </div>
      <div className={`metric-value ${change && change > 0 ? "positive" : change && change < 0 ? "negative" : ""}`}>
        {formattedValue}
      </div>
      {change !== undefined && (
        <div className="metric-change">
          <span className={change >= 0 ? "positive" : "negative"}>
            {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
          <span className="metric-period"> vs last hour</span>
        </div>
      )}
    </div>
  );
}

function ChartWidget({
  title,
  type,
  data,
  color,
  onTypeChange,
}: {
  title: string;
  type: ChartType;
  data: ChartDatapoint[];
  color: string;
  onTypeChange: (type: ChartType) => void;
}) {
  return (
    <div className="chart-widget">
      <div className="chart-header">
        <h3>{title}</h3>
        <div className="chart-controls">
          {(["line", "bar"] as ChartType[]).map((t) => (
            <button
              key={t}
              className={`chart-type-btn ${type === t ? "active" : ""}`}
              onClick={() => onTypeChange(t)}
            >
              {t === "line" ? "📈" : "📊"}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-content">
        {type === "line" && <LineChart data={data} color={color} />}
        {type === "bar" && <BarChart data={data} color={color} />}
      </div>
    </div>
  );
}

function ActivityFeed({ activities }: { activities: Activity[] }) {
  const iconMap: Record<string, string> = {
    user: "👤",
    order: "📦",
    error: "⚠️",
    system: "🔧",
    alert: "🔔",
  };

  const typeColors: Record<string, string> = {
    user: "#0f3460",
    order: "#1a4d2e",
    error: "#4d1a1a",
    system: "#4d4d1a",
    alert: "#4d1a4d",
  };

  return (
    <div className="activity-feed">
      <div className="widget-header">
        <h3>📋 Activity Feed</h3>
        <span className="activity-count">{activities.length} events</span>
      </div>
      <div className="activity-list">
        {activities.slice(0, 20).map((activity) => (
          <div key={activity.id} className="activity-item">
            <div
              className="activity-icon"
              style={{ backgroundColor: typeColors[activity.type] || "#333" }}
            >
              {iconMap[activity.type] || "•"}
            </div>
            <div className="activity-content">
              <div className="activity-title">{activity.title}</div>
              {activity.description && (
                <div className="activity-description">{activity.description}</div>
              )}
              <div className="activity-time">
                {new Date(activity.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnlineUsersWidget({ users }: { users: OnlineUser[] }) {
  const roleColors: Record<string, string> = {
    admin: "#e94560",
    user: "#0f3460",
    guest: "#4a4a4a",
  };

  return (
    <div className="online-users-widget">
      <div className="widget-header">
        <h3>👥 Online Users ({users.length})</h3>
      </div>
      <div className="users-grid">
        {users.map((user) => (
          <div key={user.userId} className="user-card" title={`${user.username} (${user.role})`}>
            <div
              className="user-avatar"
              style={{
                background: `linear-gradient(135deg, ${roleColors[user.role] || "#667eea"}, #764ba2)`,
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user.username}</div>
              <div className="user-location">{user.location || "Unknown"}</div>
            </div>
            <div className="user-status online" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsWidget({ alerts, onDismiss }: { alerts: Alert[]; onDismiss: (id: string) => void }) {
  const severityIcons: Record<string, string> = {
    info: "ℹ️",
    warning: "⚠️",
    critical: "🚨",
  };

  const severityColors: Record<string, string> = {
    info: "#0f3460",
    warning: "#f39c12",
    critical: "#e94560",
  };

  return (
    <div className="alerts-widget">
      <div className="widget-header">
        <h3>🔔 Alerts ({alerts.length})</h3>
      </div>
      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="no-alerts">No active alerts 🎉</div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="alert-item"
              style={{ borderLeftColor: severityColors[alert.severity] }}
            >
              <div className="alert-icon">{severityIcons[alert.severity]}</div>
              <div className="alert-content">
                <div className="alert-title">{alert.title}</div>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-meta">
                  <span>{alert.source}</span>
                  <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
              <button
                className="alert-dismiss"
                onClick={() => onDismiss(alert.id)}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const ranges: { value: TimeRange; label: string }[] = [
    { value: "5min", label: "Last 5 min" },
    { value: "1hour", label: "Last Hour" },
    { value: "24hours", label: "Last 24h" },
    { value: "7days", label: "Last 7 days" },
  ];

  return (
    <div className="time-range-selector">
      {ranges.map((r) => (
        <button
          key={r.value}
          className={`time-range-btn ${value === r.value ? "active" : ""}`}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Performance Stats Widget
 *
 * Displays real-time statistics from the subscriber middleware:
 * - Events received/rate-limited/deduplicated
 * - Average handler duration
 * - Current events per second
 */
function PerformanceStatsWidget({ stats }: { stats: PerformanceStats }) {
  const rateLimitPercentage =
    stats.eventsReceived > 0
      ? ((stats.eventsRateLimited / stats.eventsReceived) * 100).toFixed(1)
      : "0.0";

  const dedupePercentage =
    stats.eventsReceived > 0
      ? ((stats.eventsDeduplicated / stats.eventsReceived) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="perf-stats-widget">
      <div className="widget-header">
        <h3>Middleware Stats</h3>
        <span className="perf-badge">@pubsubjs/core</span>
      </div>
      <div className="perf-stats-grid">
        <div className="perf-stat">
          <div className="perf-stat-value">{stats.eventsReceived.toLocaleString()}</div>
          <div className="perf-stat-label">Events Received</div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-value highlight-warning">
            {stats.eventsRateLimited.toLocaleString()}
            <span className="perf-stat-percent">({rateLimitPercentage}%)</span>
          </div>
          <div className="perf-stat-label">Rate Limited</div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-value highlight-info">
            {stats.eventsDeduplicated.toLocaleString()}
            <span className="perf-stat-percent">({dedupePercentage}%)</span>
          </div>
          <div className="perf-stat-label">Deduplicated</div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-value highlight-success">
            {stats.avgHandlerDuration.toFixed(2)}ms
          </div>
          <div className="perf-stat-label">Avg Handler Time</div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-value">{stats.eventsPerSecond}</div>
          <div className="perf-stat-label">Events/sec</div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-value highlight-primary">
            {MIDDLEWARE_CONFIG.maxEventsPerSecond}
          </div>
          <div className="perf-stat-label">Rate Limit</div>
        </div>
      </div>
      <div className="perf-stats-info">
        <div className="perf-info-item">
          <span className="perf-info-icon">*</span>
          <span>Rate limiting prevents UI overload from rapid updates</span>
        </div>
        <div className="perf-info-item">
          <span className="perf-info-icon">*</span>
          <span>Idempotency skips duplicate messages by tracking message IDs</span>
        </div>
        <div className="perf-info-item">
          <span className="perf-info-icon">*</span>
          <span>Timing middleware reports handler duration for monitoring</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Dashboard
// ============================================

function Dashboard() {
  const { isConnected, metrics, onlineUsers, activities, alerts, chartData, perfStats, send } =
    usePubSubSubscriber(`ws://${window.location.host}`);

  const [timeRange, setTimeRange] = useState<TimeRange>("5min");
  const [chartTypes, setChartTypes] = useState<Record<string, ChartType>>({
    requests: "line",
    revenue: "bar",
    errors: "line",
    users: "line",
  });

  const handleDismissAlert = useCallback(
    (id: string) => {
      send("alert.dismiss", { id });
    },
    [send]
  );

  const handleTimeRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
      send("time.range.change", { range });
    },
    [send]
  );

  const handleChartTypeChange = useCallback((chartId: string, type: ChartType) => {
    setChartTypes((prev) => ({ ...prev, [chartId]: type }));
  }, []);

  // Aggregate data based on time range
  const aggregatedData = useMemo(() => {
    const pointsMap: Record<string, number> = {
      "5min": 60,
      "1hour": 60,
      "24hours": 24,
      "7days": 7,
    };
    const points = pointsMap[timeRange] || 60;

    return {
      requests: chartData.requests.slice(-points),
      revenue: chartData.revenue.slice(-points),
      errors: chartData.errors.slice(-points),
      users: chartData.users.slice(-points),
    };
  }, [chartData, timeRange]);

  // User distribution for pie chart
  const userDistribution = useMemo(() => {
    const distribution: Record<string, number> = { admin: 0, user: 0, guest: 0 };
    onlineUsers.forEach((u) => {
      distribution[u.role] = (distribution[u.role] || 0) + 1;
    });
    return [
      { label: "Admin", value: distribution.admin, color: "#e94560" },
      { label: "Users", value: distribution.user, color: "#0f3460" },
      { label: "Guests", value: distribution.guest, color: "#4a4a4a" },
    ];
  }, [onlineUsers]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>📊 Real-time Analytics Dashboard</h1>
          <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
            <span className="status-dot" />
            <span>{isConnected ? "Live" : "Disconnected"}</span>
          </div>
        </div>
        <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
      </header>

      <div className="metrics-grid">
        <MetricCard
          title="Active Users"
          value={metrics.activeUsers}
          change={12.5}
          icon="👥"
        />
        <MetricCard
          title="Orders Today"
          value={metrics.ordersToday}
          change={8.3}
          icon="📦"
        />
        <MetricCard
          title="Revenue"
          value={metrics.revenue}
          format="currency"
          change={15.2}
          icon="💰"
        />
        <MetricCard
          title="Error Rate"
          value={metrics.errorRate}
          format="percent"
          change={-2.1}
          icon="⚠️"
        />
        <MetricCard
          title="Req/sec"
          value={metrics.requestsPerSecond}
          change={5.4}
          icon="🚀"
        />
        <MetricCard
          title="Avg Response"
          value={metrics.avgResponseTime}
          format="time"
          change={-8.2}
          icon="⏱️"
        />
        <MetricCard
          title="CPU Usage"
          value={metrics.cpuUsage}
          format="percent"
          icon="🔲"
        />
        <MetricCard
          title="Memory"
          value={metrics.memoryUsage}
          format="percent"
          icon="💾"
        />
      </div>

      <div className="charts-grid">
        <ChartWidget
          title="Requests per Second"
          type={chartTypes.requests}
          data={aggregatedData.requests}
          color="#0ea5e9"
          onTypeChange={(type) => handleChartTypeChange("requests", type)}
        />
        <ChartWidget
          title="Revenue"
          type={chartTypes.revenue}
          data={aggregatedData.revenue}
          color="#10b981"
          onTypeChange={(type) => handleChartTypeChange("revenue", type)}
        />
        <ChartWidget
          title="Error Rate"
          type={chartTypes.errors}
          data={aggregatedData.errors}
          color="#ef4444"
          onTypeChange={(type) => handleChartTypeChange("errors", type)}
        />
        <ChartWidget
          title="Active Users"
          type={chartTypes.users}
          data={aggregatedData.users}
          color="#8b5cf6"
          onTypeChange={(type) => handleChartTypeChange("users", type)}
        />
      </div>

      <div className="bottom-grid">
        <div className="left-column">
          <ActivityFeed activities={activities} />
        </div>
        <div className="right-column">
          <PerformanceStatsWidget stats={perfStats} />
          <OnlineUsersWidget users={onlineUsers} />
          <div className="pie-chart-widget">
            <div className="widget-header">
              <h3>User Distribution</h3>
            </div>
            <PieChart data={userDistribution} height={150} />
          </div>
          <AlertsWidget alerts={alerts} onDismiss={handleDismissAlert} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Mount App
// ============================================

const root = createRoot(document.getElementById("root")!);
root.render(<Dashboard />);
