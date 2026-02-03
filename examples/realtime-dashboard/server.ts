/**
 * Real-time Dashboard Server
 *
 * Serves the dashboard HTML and handles WebSocket connections
 * for real-time data updates with simulated metrics.
 *
 * Run with: bun examples/realtime-dashboard/server.ts
 * Then open http://localhost:3002
 */

import index from "./index.html";
import type { MetricData, OnlineUser, Activity, Alert, ChartDatapoint, TimeRange } from "./events.ts";
import type { ServerWebSocket } from "bun";

const PORT = 3002;

// Simulated data store
interface DashboardState {
  metrics: MetricData;
  onlineUsers: Map<string, OnlineUser>;
  activities: Activity[];
  alerts: Alert[];
  chartData: {
    requests: ChartDatapoint[];
    revenue: ChartDatapoint[];
    errors: ChartDatapoint[];
    users: ChartDatapoint[];
  };
}

const state: DashboardState = {
  metrics: {
    activeUsers: 1247,
    ordersToday: 384,
    revenue: 48920,
    errorRate: 0.23,
    requestsPerSecond: 245,
    avgResponseTime: 45,
    cpuUsage: 32,
    memoryUsage: 68,
  },
  onlineUsers: new Map(),
  activities: [],
  alerts: [],
  chartData: {
    requests: [],
    revenue: [],
    errors: [],
    users: [],
  },
};

// Initialize with some sample data
const sampleUsers: OnlineUser[] = [
  { userId: "u1", username: "Alice", role: "admin", location: "US-East" },
  { userId: "u2", username: "Bob", role: "user", location: "EU-West" },
  { userId: "u3", username: "Charlie", role: "user", location: "US-West" },
  { userId: "u4", username: "Diana", role: "admin", location: "APAC" },
  { userId: "u5", username: "Eve", role: "guest", location: "EU-Central" },
];

sampleUsers.forEach((user: OnlineUser) => state.onlineUsers.set(user.userId, user));

// Initialize chart data with historical points
const now = Date.now();
for (let i = 60; i >= 0; i--) {
  const timestamp = now - i * 1000;
  state.chartData.requests.push({ timestamp, value: 200 + Math.random() * 100, chartId: "requests" });
  state.chartData.revenue.push({ timestamp, value: 800 + Math.random() * 400, chartId: "revenue" });
  state.chartData.errors.push({ timestamp, value: Math.random() * 5, chartId: "errors" });
  state.chartData.users.push({ timestamp, value: 1000 + Math.random() * 500, chartId: "users" });
}

// Sample activities
const sampleActivities: Activity[] = [
  { id: "a1", type: "order", title: "New order #1234", description: "$299.99 - Premium Plan", timestamp: now - 30000 },
  { id: "a2", type: "user", title: "Alice came online", timestamp: now - 60000 },
  { id: "a3", type: "system", title: "Database backup completed", timestamp: now - 120000 },
  { id: "a4", type: "order", title: "New order #1233", description: "$149.99 - Basic Plan", timestamp: now - 180000 },
];
state.activities = sampleActivities;

// WebSocket connections
const connections = new Set<ServerWebSocket<unknown>>();

function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Metric simulation
function simulateMetrics() {
  // Update metrics with realistic fluctuations
  const metrics = state.metrics;
  metrics.activeUsers = Math.max(0, metrics.activeUsers + Math.floor(Math.random() * 20) - 10);
  metrics.ordersToday += Math.random() > 0.7 ? 1 : 0;
  metrics.revenue += Math.floor(Math.random() * 150);
  metrics.errorRate = Math.max(0, Math.min(100, metrics.errorRate + (Math.random() - 0.5) * 0.5));
  metrics.requestsPerSecond = Math.max(50, 200 + Math.floor(Math.random() * 100));
  metrics.avgResponseTime = Math.max(10, 40 + Math.floor(Math.random() * 30));
  metrics.cpuUsage = Math.max(0, Math.min(100, metrics.cpuUsage + (Math.random() - 0.5) * 5));
  metrics.memoryUsage = Math.max(0, Math.min(100, metrics.memoryUsage + (Math.random() - 0.5) * 2));

  broadcast("metrics.update", metrics);

  // Add chart datapoints
  const timestamp = Date.now();
  
  const requestsPoint: ChartDatapoint = { timestamp, value: metrics.requestsPerSecond, chartId: "requests" };
  const revenuePoint: ChartDatapoint = { timestamp, value: Math.floor(Math.random() * 500) + 500, chartId: "revenue" };
  const errorsPoint: ChartDatapoint = { timestamp, value: metrics.errorRate, chartId: "errors" };
  const usersPoint: ChartDatapoint = { timestamp, value: metrics.activeUsers, chartId: "users" };

  state.chartData.requests.push(requestsPoint);
  state.chartData.revenue.push(revenuePoint);
  state.chartData.errors.push(errorsPoint);
  state.chartData.users.push(usersPoint);

  // Keep only last 60 points
  Object.keys(state.chartData).forEach(key => {
    const k = key as keyof typeof state.chartData;
    if (state.chartData[k].length > 60) {
      state.chartData[k] = state.chartData[k].slice(-60);
    }
  });

  broadcast("chart.datapoint", requestsPoint);
  broadcast("chart.datapoint", revenuePoint);
  broadcast("chart.datapoint", errorsPoint);
  broadcast("chart.datapoint", usersPoint);

  // Randomly trigger alerts
  if (Math.random() > 0.95) {
    const severities = ["info", "warning", "critical"] as const;
    const severity = severities[Math.floor(Math.random() * severities.length)]!;
    const alert: Alert = {
      id: `alert_${Date.now()}`,
      severity,
      title: severity === "critical" ? "System Alert" : severity === "warning" ? "Warning" : "Info",
      message: `Simulated ${severity} alert at ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      source: "simulation",
    };
    state.alerts.push(alert);
    broadcast("alert.trigger", alert);

    const activity: Activity = {
      id: `act_${Date.now()}`,
      type: "alert",
      title: alert.title,
      description: alert.message,
      timestamp: Date.now(),
      metadata: { severity },
    };
    state.activities.unshift(activity);
    broadcast("activity.new", activity);
  }

  // Randomly simulate user activity
  if (Math.random() > 0.8) {
    const names = ["Frank", "Grace", "Henry", "Ivy", "Jack", "Kate", "Liam", "Mia"];
    const name = names[Math.floor(Math.random() * names.length)]!;
    const user: OnlineUser = {
      userId: `user_${Date.now()}`,
      username: name,
      role: "user",
      location: ["US-East", "EU-West", "APAC", "US-West"][Math.floor(Math.random() * 4)],
    };
    state.onlineUsers.set(user.userId, user);
    broadcast("user.online", user);

    const activity: Activity = {
      id: `act_${Date.now()}`,
      type: "user",
      title: `${name} came online`,
      timestamp: Date.now(),
    };
    state.activities.unshift(activity);
    broadcast("activity.new", activity);
  }

  // Randomly simulate orders
  if (Math.random() > 0.85) {
    const orderAmount = Math.floor(Math.random() * 500) + 50;
    const activity: Activity = {
      id: `act_${Date.now()}`,
      type: "order",
      title: `New order received`,
      description: `$${orderAmount.toFixed(2)} - ${["Basic", "Pro", "Enterprise"][Math.floor(Math.random() * 3)]} Plan`,
      timestamp: Date.now(),
    };
    state.activities.unshift(activity);
    broadcast("activity.new", activity);
  }

  // Keep activities limited
  if (state.activities.length > 50) {
    state.activities = state.activities.slice(0, 50);
  }
}

// Start simulation
setInterval(simulateMetrics, 1000);

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": index,
    "/api/metrics": () => Response.json(state.metrics),
    "/api/users": () => Response.json(Array.from(state.onlineUsers.values())),
    "/api/activities": () => Response.json(state.activities),
    "/api/alerts": () => Response.json(state.alerts),
    "/api/charts/:chartId": (req) => {
      const chartId = req.params.chartId as keyof typeof state.chartData;
      const data = state.chartData[chartId] || [];
      return Response.json(data);
    },
  },
  websocket: {
    open(ws) {
      connections.add(ws);
      console.log(`WebSocket connected. Total connections: ${connections.size}`);
      
      // Send initial state
      ws.send(JSON.stringify({ event: "metrics.update", payload: state.metrics }));
      Array.from(state.onlineUsers.values()).forEach((user: OnlineUser) => {
        ws.send(JSON.stringify({ event: "user.online", payload: user }));
      });
      state.activities.forEach((activity: Activity) => {
        ws.send(JSON.stringify({ event: "activity.new", payload: activity }));
      });
      state.alerts.forEach((alert: Alert) => {
        ws.send(JSON.stringify({ event: "alert.trigger", payload: alert }));
      });
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString()) as { event: string; payload: unknown };
        
        // Handle client messages (e.g., dismiss alert, change time range)
        if (data.event === "alert.dismiss") {
          const alertId = (data.payload as { id: string }).id;
          state.alerts = state.alerts.filter((a: Alert) => a.id !== alertId);
          broadcast("alert.dismiss", data.payload);
        } else if (data.event === "time.range.change") {
          // Handle time range change - could adjust data aggregation
          broadcast("time.range.change", data.payload as { range: TimeRange });
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    },
    close(ws) {
      connections.delete(ws);
      console.log(`WebSocket disconnected. Total connections: ${connections.size}`);
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`
╔═══════════════════════════════════════════════════╗
║         Real-time Analytics Dashboard             ║
╠═══════════════════════════════════════════════════╣
║  Open http://localhost:${PORT} in your browser       ║
║                                                   ║
║  Features:                                        ║
║    • Real-time metrics with live updates          ║
║    • Multiple chart types (line, bar, pie)        ║
║    • User presence with visual indicators         ║
║    • Real-time activity feed                      ║
║    • Alert system with severity levels            ║
║    • Time-range selection                         ║
║    • WebSocket-based real-time updates            ║
║                                                   ║
║  API Endpoints:                                   ║
║    • GET /api/metrics                             ║
║    • GET /api/users                               ║
║    • GET /api/activities                          ║
║    • GET /api/alerts                              ║
║    • GET /api/charts/:chartId                     ║
║                                                   ║
║  WebSocket: ws://localhost:${PORT}                   ║
╚═══════════════════════════════════════════════════╝
`);
