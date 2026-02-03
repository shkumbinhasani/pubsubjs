/**
 * SSE Notifications Server
 *
 * This server demonstrates:
 * - Server-Sent Events for real-time notifications
 * - Broadcasting to multiple clients
 * - Different notification types
 *
 * Run with: bun examples/sse-notifications/server.ts
 */

import { generateMessageId } from "@pubsubjs/core";
import { NotificationEvents } from "./events.ts";

const PORT = 3001;

// ============================================
// SSE Client Management
// ============================================

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  channels: Set<string>;
}

const clients = new Map<string, SSEClient>();

function broadcastToChannel(channel: string, data: unknown) {
  const message = JSON.stringify({
    channel,
    payload: data,
    messageId: generateMessageId(),
  });

  const sseData = `event: message\ndata: ${message}\n\n`;

  for (const client of clients.values()) {
    if (client.channels.has(channel) || client.channels.has("*")) {
      try {
        client.controller.enqueue(new TextEncoder().encode(sseData));
      } catch {
        // Client might have disconnected
        clients.delete(client.id);
      }
    }
  }
}

function broadcastAll(channel: string, data: unknown) {
  const message = JSON.stringify({
    channel,
    payload: data,
    messageId: generateMessageId(),
  });

  const sseData = `event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients.values()) {
    try {
      client.controller.enqueue(new TextEncoder().encode(sseData));
    } catch {
      clients.delete(client.id);
    }
  }
}

// ============================================
// Notification Publishing Functions
// ============================================

function publishInfo(title: string, message: string) {
  const notification = {
    id: generateMessageId(),
    title,
    message,
    timestamp: Date.now(),
  };
  broadcastAll("notification.info", notification);
  console.log(`[Server] Published info: ${title}`);
}

function publishSuccess(title: string, message: string) {
  const notification = {
    id: generateMessageId(),
    title,
    message,
    timestamp: Date.now(),
  };
  broadcastAll("notification.success", notification);
  console.log(`[Server] Published success: ${title}`);
}

function publishWarning(title: string, message: string) {
  const notification = {
    id: generateMessageId(),
    title,
    message,
    timestamp: Date.now(),
  };
  broadcastAll("notification.warning", notification);
  console.log(`[Server] Published warning: ${title}`);
}

function publishError(title: string, message: string) {
  const notification = {
    id: generateMessageId(),
    title,
    message,
    timestamp: Date.now(),
  };
  broadcastAll("notification.error", notification);
  console.log(`[Server] Published error: ${title}`);
}

function publishProgress(id: string, title: string, progress: number, status: string) {
  const notification = {
    id,
    title,
    progress,
    status,
    timestamp: Date.now(),
  };
  broadcastAll("notification.progress", notification);
}

function publishAnnouncement(message: string, priority: "low" | "medium" | "high") {
  const announcement = {
    id: generateMessageId(),
    message,
    priority,
    timestamp: Date.now(),
  };
  broadcastAll("system.announcement", announcement);
  console.log(`[Server] Published announcement: ${message}`);
}

function publishUserActivity(userId: string, username: string, action: string) {
  const activity = {
    userId,
    username,
    action,
    timestamp: Date.now(),
  };
  broadcastAll("user.activity", activity);
}

// ============================================
// HTTP Server
// ============================================

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // SSE endpoint
    if (url.pathname === "/events") {
      const channels = url.searchParams.get("channels")?.split(",") || ["*"];
      const clientId = generateMessageId();

      console.log(`[Server] Client ${clientId} connected, channels: ${channels.join(", ")}`);

      const stream = new ReadableStream({
        start(controller) {
          const client: SSEClient = {
            id: clientId,
            controller,
            channels: new Set(channels),
          };
          clients.set(clientId, client);

          // Send initial connection message
          const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
          controller.enqueue(new TextEncoder().encode(connectMsg));
        },
        cancel() {
          console.log(`[Server] Client ${clientId} disconnected`);
          clients.delete(clientId);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // API endpoints for triggering notifications
    if (url.pathname === "/api/notify" && req.method === "POST") {
      return (async () => {
        const body = await req.json();
        const { type, title, message, priority } = body;

        switch (type) {
          case "info":
            publishInfo(title, message);
            break;
          case "success":
            publishSuccess(title, message);
            break;
          case "warning":
            publishWarning(title, message);
            break;
          case "error":
            publishError(title, message);
            break;
          case "announcement":
            publishAnnouncement(message, priority || "medium");
            break;
          default:
            return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }));
      })();
    }

    // Serve demo HTML page
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML_PAGE, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Stats endpoint
    if (url.pathname === "/api/stats") {
      return new Response(
        JSON.stringify({
          connectedClients: clients.size,
          clientIds: Array.from(clients.keys()),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
});

// ============================================
// Demo: Simulate notifications
// ============================================

async function simulateActivity() {
  const users = ["Alice", "Bob", "Charlie", "Diana"];
  const actions = [
    "logged in",
    "updated their profile",
    "posted a comment",
    "uploaded a file",
    "joined a channel",
  ];

  // Periodic user activity
  setInterval(() => {
    if (clients.size > 0) {
      const user = users[Math.floor(Math.random() * users.length)]!;
      const action = actions[Math.floor(Math.random() * actions.length)]!;
      publishUserActivity(`user_${Math.random().toString(36).slice(2, 8)}`, user, action);
    }
  }, 5000);

  // Periodic system announcements
  setInterval(() => {
    if (clients.size > 0) {
      const announcements = [
        { msg: "System maintenance scheduled for tonight", priority: "medium" },
        { msg: "New feature available: Dark mode!", priority: "low" },
        { msg: "Server will restart in 5 minutes", priority: "high" },
      ];
      const ann = announcements[Math.floor(Math.random() * announcements.length)]!;
      publishAnnouncement(ann.msg, ann.priority);
    }
  }, 15000);

  // Simulate a file upload with progress
  setTimeout(async () => {
    if (clients.size > 0) {
      const uploadId = generateMessageId();
      publishInfo("Upload Started", "Your file is being uploaded...");

      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise((r) => setTimeout(r, 300));
        publishProgress(uploadId, "Uploading file.zip", progress, `${progress}% complete`);
      }

      publishSuccess("Upload Complete", "Your file has been uploaded successfully!");
    }
  }, 3000);
}

// ============================================
// HTML Demo Page
// ============================================

const HTML_PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>SSE Notifications Demo</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .status {
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .connected { background: #d4edda; color: #155724; }
    .disconnected { background: #f8d7da; color: #721c24; }
    .notifications {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .notification {
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .notification.info { border-color: #17a2b8; }
    .notification.success { border-color: #28a745; }
    .notification.warning { border-color: #ffc107; }
    .notification.error { border-color: #dc3545; }
    .notification.progress { border-color: #6c757d; }
    .notification.announcement { border-color: #6f42c1; background: #f3e5f5; }
    .notification.activity { border-color: #20c997; background: #e8f5f1; }
    .notification h4 { margin: 0 0 5px 0; }
    .notification p { margin: 0; color: #666; }
    .notification .time { font-size: 12px; color: #999; }
    .progress-bar {
      height: 20px;
      background: #e9ecef;
      border-radius: 10px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-bar-fill {
      height: 100%;
      background: #17a2b8;
      transition: width 0.3s ease;
    }
    .controls {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    button.info { background: #17a2b8; color: white; }
    button.success { background: #28a745; color: white; }
    button.warning { background: #ffc107; color: #333; }
    button.error { background: #dc3545; color: white; }
  </style>
</head>
<body>
  <h1>🔔 SSE Notifications Demo</h1>

  <div id="status" class="status disconnected">Connecting...</div>

  <div class="controls">
    <button class="info" onclick="sendNotification('info', 'Info', 'This is an info message')">
      Send Info
    </button>
    <button class="success" onclick="sendNotification('success', 'Success', 'Operation completed!')">
      Send Success
    </button>
    <button class="warning" onclick="sendNotification('warning', 'Warning', 'Please review this')">
      Send Warning
    </button>
    <button class="error" onclick="sendNotification('error', 'Error', 'Something went wrong')">
      Send Error
    </button>
  </div>

  <div id="notifications" class="notifications"></div>

  <script>
    const statusEl = document.getElementById('status');
    const notificationsEl = document.getElementById('notifications');
    const progressBars = new Map();

    function connect() {
      const eventSource = new EventSource('/events');

      eventSource.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        statusEl.textContent = 'Connected (ID: ' + data.clientId + ')';
        statusEl.className = 'status connected';
      });

      eventSource.addEventListener('notification.info', (e) => {
        addNotification('info', JSON.parse(e.data));
      });

      eventSource.addEventListener('notification.success', (e) => {
        addNotification('success', JSON.parse(e.data));
      });

      eventSource.addEventListener('notification.warning', (e) => {
        addNotification('warning', JSON.parse(e.data));
      });

      eventSource.addEventListener('notification.error', (e) => {
        addNotification('error', JSON.parse(e.data));
      });

      eventSource.addEventListener('notification.progress', (e) => {
        const data = JSON.parse(e.data);
        updateProgress(data);
      });

      eventSource.addEventListener('system.announcement', (e) => {
        addNotification('announcement', JSON.parse(e.data));
      });

      eventSource.addEventListener('user.activity', (e) => {
        const data = JSON.parse(e.data);
        addNotification('activity', {
          title: 'User Activity',
          message: data.username + ' ' + data.action,
          timestamp: data.timestamp
        });
      });

      eventSource.onerror = () => {
        statusEl.textContent = 'Disconnected - Reconnecting...';
        statusEl.className = 'status disconnected';
      };
    }

    function addNotification(type, data) {
      const div = document.createElement('div');
      div.className = 'notification ' + type;
      div.innerHTML = \`
        <h4>\${data.title || type.toUpperCase()}</h4>
        <p>\${data.message}</p>
        <span class="time">\${new Date(data.timestamp).toLocaleTimeString()}</span>
      \`;
      notificationsEl.prepend(div);

      // Keep only last 20 notifications
      while (notificationsEl.children.length > 20) {
        notificationsEl.lastChild.remove();
      }
    }

    function updateProgress(data) {
      let div = progressBars.get(data.id);

      if (!div) {
        div = document.createElement('div');
        div.className = 'notification progress';
        div.id = 'progress-' + data.id;
        div.innerHTML = \`
          <h4>\${data.title}</h4>
          <p class="status-text">\${data.status}</p>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: \${data.progress}%"></div>
          </div>
        \`;
        notificationsEl.prepend(div);
        progressBars.set(data.id, div);
      } else {
        div.querySelector('.status-text').textContent = data.status;
        div.querySelector('.progress-bar-fill').style.width = data.progress + '%';
      }

      if (data.progress >= 100) {
        setTimeout(() => {
          div.remove();
          progressBars.delete(data.id);
        }, 2000);
      }
    }

    async function sendNotification(type, title, message) {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, message })
      });
    }

    connect();
  </script>
</body>
</html>`;

// ============================================
// Main
// ============================================

console.log(`
╔═══════════════════════════════════════════════════╗
║         SSE Notifications Server                  ║
╠═══════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}          ║
║                                                   ║
║  Open http://localhost:${PORT} in your browser       ║
║  to see the demo                                  ║
║                                                   ║
║  API Endpoints:                                   ║
║    GET  /events     - SSE stream                  ║
║    POST /api/notify - Send notification           ║
║    GET  /api/stats  - Connection stats            ║
╚═══════════════════════════════════════════════════╝
`);

// Start simulating activity
simulateActivity();
