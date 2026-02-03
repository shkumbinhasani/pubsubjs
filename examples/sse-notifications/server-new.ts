/**
 * Production-Ready Notification Server
 * 
 * Features:
 * - User subscription management
 * - Notification preferences
 * - Multi-channel delivery (in-app, email, push, SMS)
 * - Rate limiting
 * - Retry logic
 * - Notification templates
 * - Web UI for viewing notifications
 * - REST API for sending notifications
 */

import { 
  initializeDemoUsers,
  getUser,
  getAllUsers,
  subscribeToTopic,
  unsubscribeFromTopic,
  getUserSubscriptions,
  updateUserPreferences,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats,
} from "./src/user-manager.ts";

import { initializeDefaultTemplates, getAllTemplates } from "./src/template-manager.ts";
import { 
  sendNotification, 
  broadcastToTopic,
  registerSSEClient,
  unregisterSSEClient,
  getConnectedClients,
  getDeliveryStats,
} from "./src/notification-service.ts";
import { getRateLimiter } from "./src/rate-limiter.ts";
import type { SSEClient, SendNotificationRequest } from "./src/types.ts";

const PORT = 3001;

// ============================================
// Initialize Data
// ============================================

initializeDemoUsers();
initializeDefaultTemplates();

// ============================================
// HTTP Server
// ============================================

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // SSE endpoint
    if (path === "/events") {
      return handleSSE(req);
    }

    // Static files
    if (path === "/" || path === "/index.html") {
      return new Response(HTML_PAGE, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // API Routes
    if (path.startsWith("/api/")) {
      return handleAPI(req, corsHeaders);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

// ============================================
// SSE Handler
// ============================================

function handleSSE(req: Request): Response {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "anonymous";
  const clientId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  console.log(`[SSE] Client ${clientId} connected for user ${userId}`);

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = {
        id: clientId,
        userId,
        controller,
        connectedAt: Date.now(),
        lastPingAt: Date.now(),
        channels: new Set(["*"]),
      };

      registerSSEClient(client);

      // Send connection confirmation
      const connectMsg = JSON.stringify({ 
        type: "connected", 
        clientId,
        userId,
        timestamp: Date.now(),
      });
      controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${connectMsg}\n\n`));

      // Send any unread notifications
      const { notifications } = getUserNotifications(userId, { unreadOnly: true, limit: 10 });
      if (notifications.length > 0) {
        const unreadMsg = JSON.stringify({ type: "unread", notifications });
        controller.enqueue(new TextEncoder().encode(`event: unread\ndata: ${unreadMsg}\n\n`));
      }
    },
    cancel() {
      console.log(`[SSE] Client ${clientId} disconnected`);
      unregisterSSEClient(clientId);
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

// ============================================
// API Handler
// ============================================

async function handleAPI(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  try {
    // Send notification
    if (path === "/api/notifications/send" && method === "POST") {
      const body = await req.json() as SendNotificationRequest;
      const result = await sendNotification(body);
      
      return jsonResponse(result, result.success ? 200 : 400, corsHeaders);
    }

    // Broadcast to topic
    if (path === "/api/notifications/broadcast" && method === "POST") {
      const body = await req.json() as { topic: string } & Omit<SendNotificationRequest, "userId">;
      const result = await broadcastToTopic(body.topic, body);
      
      return jsonResponse({ success: true, result }, 200, corsHeaders);
    }

    // Get user notifications
    if (path.match(/\/api\/users\/[^/]+\/notifications/) && method === "GET") {
      const userId = path.split("/")[3]!;
      const unreadOnly = url.searchParams.get("unread") === "true";
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const result = getUserNotifications(userId, { unreadOnly, limit, offset });
      return jsonResponse(result, 200, corsHeaders);
    }

    // Mark notification as read
    if (path.match(/\/api\/users\/[^/]+\/notifications\/[^/]+\/read/) && method === "POST") {
      const parts = path.split("/");
      const userId = parts[3]!;
      const notificationId = parts[5]!;

      const notification = markNotificationAsRead(userId, notificationId);
      return jsonResponse({ success: !!notification, notification }, notification ? 200 : 404, corsHeaders);
    }

    // Mark all notifications as read
    if (path.match(/\/api\/users\/[^/]+\/notifications\/read-all/) && method === "POST") {
      const userId = path.split("/")[3]!;
      const count = markAllNotificationsAsRead(userId);

      return jsonResponse({ success: true, markedAsRead: count }, 200, corsHeaders);
    }

    // Delete notification
    if (path.match(/\/api\/users\/[^/]+\/notifications\/[^/]+/) && method === "DELETE") {
      const parts = path.split("/");
      const userId = parts[3]!;
      const notificationId = parts[5]!;

      const success = deleteNotification(userId, notificationId);
      return jsonResponse({ success }, success ? 200 : 404, corsHeaders);
    }

    // Get user stats
    if (path.match(/\/api\/users\/[^/]+\/stats/) && method === "GET") {
      const userId = path.split("/")[3]!;
      const stats = getNotificationStats(userId);

      return jsonResponse(stats, 200, corsHeaders);
    }

    // Get user subscriptions
    if (path.match(/\/api\/users\/[^/]+\/subscriptions/) && method === "GET") {
      const userId = path.split("/")[3]!;
      const subscriptions = getUserSubscriptions(userId);

      return jsonResponse({ subscriptions }, 200, corsHeaders);
    }

    // Subscribe to topic
    if (path === "/api/subscriptions" && method === "POST") {
      const body = await req.json() as { userId: string; topic: string };
      const subscription = subscribeToTopic(body.userId, body.topic);

      return jsonResponse({ success: !!subscription, subscription }, subscription ? 200 : 404, corsHeaders);
    }

    // Unsubscribe from topic
    if (path === "/api/subscriptions" && method === "DELETE") {
      const body = await req.json() as { userId: string; topic: string };
      const success = unsubscribeFromTopic(body.userId, body.topic);

      return jsonResponse({ success }, success ? 200 : 404, corsHeaders);
    }

    // Update user preferences
    if (path.match(/\/api\/users\/[^/]+\/preferences/) && method === "PUT") {
      const userId = path.split("/")[3]!;
      const body = await req.json();
      const user = updateUserPreferences(userId, body.preferences);

      return jsonResponse({ success: !!user, user }, user ? 200 : 404, corsHeaders);
    }

    // Get all users (for demo)
    if (path === "/api/users" && method === "GET") {
      const users = getAllUsers();
      return jsonResponse({ users }, 200, corsHeaders);
    }

    // Get all templates
    if (path === "/api/templates" && method === "GET") {
      const templates = getAllTemplates();
      return jsonResponse({ templates }, 200, corsHeaders);
    }

    // Get system stats
    if (path === "/api/stats" && method === "GET") {
      const rateLimiter = getRateLimiter();
      const deliveryStats = getDeliveryStats();
      const connectedClients = getConnectedClients();

      return jsonResponse({
        connectedClients: connectedClients.length,
        deliveryStats,
        rateLimitStatus: "active",
      }, 200, corsHeaders);
    }

    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  } catch (error) {
    console.error("[API Error]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      500,
      corsHeaders
    );
  }
}

function jsonResponse(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// ============================================
// HTML Page
// ============================================

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notification Center</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    header h1 { font-size: 2.5em; margin-bottom: 10px; }
    header p { opacity: 0.9; font-size: 1.1em; }
    .grid {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 20px;
    }
    .sidebar {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      height: fit-content;
    }
    .main-content {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .section { margin-bottom: 30px; }
    .section h2 {
      font-size: 1.3em;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f0f0f0;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
      color: #555;
    }
    input, select, textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    }
    button:hover {
      background: #5a6fd6;
      transform: translateY(-1px);
    }
    button.secondary {
      background: #6c757d;
    }
    button.secondary:hover {
      background: #5a6268;
    }
    .notification {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid;
      background: #f8f9fa;
      transition: all 0.2s;
    }
    .notification:hover {
      transform: translateX(5px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .notification.info { border-color: #17a2b8; background: #e3f2fd; }
    .notification.success { border-color: #28a745; background: #e8f5e9; }
    .notification.warning { border-color: #ffc107; background: #fff3e0; }
    .notification.error { border-color: #dc3545; background: #ffebee; }
    .notification.announcement { border-color: #6f42c1; background: #f3e5f5; }
    .notification.activity { border-color: #20c997; background: #e0f2f1; }
    .notification.unread {
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
    }
    .notification-title {
      font-weight: 600;
      color: #333;
    }
    .notification-time {
      font-size: 12px;
      color: #666;
    }
    .notification-body {
      color: #555;
      font-size: 14px;
    }
    .notification-actions {
      margin-top: 10px;
      display: flex;
      gap: 10px;
    }
    .notification-actions button {
      padding: 5px 12px;
      font-size: 12px;
    }
    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .status.connected { background: #d4edda; color: #155724; }
    .status.disconnected { background: #f8d7da; color: #721c24; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: 700;
      color: #667eea;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .user-selector {
      margin-bottom: 20px;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid #f0f0f0;
    }
    .tab {
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      font-weight: 500;
    }
    .tab.active {
      border-bottom-color: #667eea;
      color: #667eea;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Notification Center</h1>
      <p>Production-ready notification system with multi-channel delivery</p>
    </header>

    <div class="grid">
      <aside class="sidebar">
        <div class="section">
          <h2>Connection Status</h2>
          <div id="connectionStatus">
            <span class="status disconnected">Disconnected</span>
          </div>
        </div>

        <div class="section">
          <h2>Select User</h2>
          <div class="form-group user-selector">
            <select id="userSelect">
              <option value="user-1">Alice (user-1)</option>
              <option value="user-2">Bob (user-2)</option>
              <option value="user-3">Charlie (user-3)</option>
            </select>
          </div>
        </div>

        <div class="section">
          <h2>Quick Stats</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value" id="totalNotifs">0</div>
              <div class="stat-label">Total</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="unreadNotifs">0</div>
              <div class="stat-label">Unread</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Actions</h2>
          <button onclick="markAllRead()" class="secondary" style="width: 100%; margin-bottom: 10px;">
            Mark All as Read
          </button>
          <button onclick="refreshNotifications()" class="secondary" style="width: 100%;">
            Refresh
          </button>
        </div>
      </aside>

      <main class="main-content">
        <div class="tabs">
          <div class="tab active" onclick="switchTab('notifications')">Notifications</div>
          <div class="tab" onclick="switchTab('send')">Send Notification</div>
          <div class="tab" onclick="switchTab('broadcast')">Broadcast</div>
          <div class="tab" onclick="switchTab('settings')">Settings</div>
        </div>

        <div id="notifications" class="tab-content active">
          <div class="section">
            <h2>Your Notifications</h2>
            <div id="notificationsList">
              <div class="empty-state">Connect to see your notifications</div>
            </div>
          </div>
        </div>

        <div id="send" class="tab-content">
          <div class="section">
            <h2>Send Notification</h2>
            <form id="sendForm" onsubmit="sendNotification(event)">
              <div class="form-group">
                <label>Recipient User ID</label>
                <input type="text" id="recipientId" placeholder="user-1" required>
              </div>
              <div class="form-group">
                <label>Type</label>
                <select id="notifType">
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="announcement">Announcement</option>
                  <option value="activity">Activity</option>
                </select>
              </div>
              <div class="form-group">
                <label>Priority</label>
                <select id="notifPriority">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div class="form-group">
                <label>Title</label>
                <input type="text" id="notifTitle" placeholder="Notification title" required>
              </div>
              <div class="form-group">
                <label>Message</label>
                <textarea id="notifMessage" rows="3" placeholder="Notification message" required></textarea>
              </div>
              <div class="form-group">
                <label>Channels (comma-separated)</label>
                <input type="text" id="notifChannels" value="in-app" placeholder="in-app, email, push, sms">
              </div>
              <button type="submit">Send Notification</button>
            </form>
          </div>
        </div>

        <div id="broadcast" class="tab-content">
          <div class="section">
            <h2>Broadcast to Topic</h2>
            <form id="broadcastForm" onsubmit="broadcastNotification(event)">
              <div class="form-group">
                <label>Topic</label>
                <select id="broadcastTopic">
                  <option value="system.announcements">System Announcements</option>
                  <option value="user.activity">User Activity</option>
                </select>
              </div>
              <div class="form-group">
                <label>Type</label>
                <select id="broadcastType">
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div class="form-group">
                <label>Title</label>
                <input type="text" id="broadcastTitle" placeholder="Broadcast title" required>
              </div>
              <div class="form-group">
                <label>Message</label>
                <textarea id="broadcastMessage" rows="3" placeholder="Broadcast message" required></textarea>
              </div>
              <button type="submit">Broadcast</button>
            </form>
          </div>
        </div>

        <div id="settings" class="tab-content">
          <div class="section">
            <h2>Subscriptions</h2>
            <div id="subscriptionsList">
              <div class="empty-state">Loading subscriptions...</div>
            </div>
          </div>
          <div class="section">
            <h2>Subscribe to Topic</h2>
            <form onsubmit="subscribeToTopic(event)">
              <div class="form-group">
                <label>Topic</label>
                <input type="text" id="subscribeTopic" placeholder="topic.name" required>
              </div>
              <button type="submit">Subscribe</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  </div>

  <script>
    let eventSource = null;
    let currentUserId = 'user-1';
    let notifications = [];

    // Initialize
    document.getElementById('userSelect').addEventListener('change', (e) => {
      currentUserId = e.target.value;
      connectSSE();
      refreshNotifications();
      loadSubscriptions();
    });

    function connectSSE() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(\`/events?userId=\${currentUserId}\`);

      eventSource.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        document.getElementById('connectionStatus').innerHTML = 
          \`<span class="status connected">Connected (\${data.clientId.slice(0, 8)})</span>\`;
      });

      eventSource.addEventListener('notification', (e) => {
        const data = JSON.parse(e.data);
        addNotification(data.notification);
        updateStats();
      });

      eventSource.addEventListener('unread', (e) => {
        const data = JSON.parse(e.data);
        notifications = data.notifications;
        renderNotifications();
        updateStats();
      });

      eventSource.onerror = () => {
        document.getElementById('connectionStatus').innerHTML = 
          \`<span class="status disconnected">Disconnected - Reconnecting...</span>\`;
      };
    }

    function addNotification(notification) {
      notifications.unshift(notification);
      renderNotifications();
      updateStats();
    }

    function renderNotifications() {
      const container = document.getElementById('notificationsList');
      
      if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state">No notifications yet</div>';
        return;
      }

      container.innerHTML = notifications.map(n => \`
        <div class="notification \${n.type} \${n.metadata.status !== 'read' ? 'unread' : ''}">
          <div class="notification-header">
            <span class="notification-title">\${n.title}</span>
            <span class="notification-time">\${new Date(n.timestamp).toLocaleString()}</span>
          </div>
          <div class="notification-body">\${n.message}</div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            Type: \${n.type} | Priority: \${n.priority} | Channels: \${n.metadata.channels.join(', ')}
          </div>
          <div class="notification-actions">
            \${n.metadata.status !== 'read' ? 
              \`<button onclick="markAsRead('\${n.id}')">Mark as Read</button>\` : ''}
            <button class="secondary" onclick="deleteNotification('\${n.id}')">Delete</button>
          </div>
        </div>
      \`).join('');
    }

    function updateStats() {
      const total = notifications.length;
      const unread = notifications.filter(n => n.metadata.status !== 'read').length;
      document.getElementById('totalNotifs').textContent = total;
      document.getElementById('unreadNotifs').textContent = unread;
    }

    async function refreshNotifications() {
      try {
        const response = await fetch(\`/api/users/\${currentUserId}/notifications\`);
        const data = await response.json();
        notifications = data.notifications;
        renderNotifications();
        updateStats();
      } catch (error) {
        console.error('Failed to refresh notifications:', error);
      }
    }

    async function markAsRead(notificationId) {
      try {
        await fetch(\`/api/users/\${currentUserId}/notifications/\${notificationId}/read\`, {
          method: 'POST'
        });
        refreshNotifications();
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    }

    async function markAllRead() {
      try {
        await fetch(\`/api/users/\${currentUserId}/notifications/read-all\`, {
          method: 'POST'
        });
        refreshNotifications();
      } catch (error) {
        console.error('Failed to mark all as read:', error);
      }
    }

    async function deleteNotification(notificationId) {
      try {
        await fetch(\`/api/users/\${currentUserId}/notifications/\${notificationId}\`, {
          method: 'DELETE'
        });
        refreshNotifications();
      } catch (error) {
        console.error('Failed to delete notification:', error);
      }
    }

    async function sendNotification(event) {
      event.preventDefault();
      
      const body = {
        userId: document.getElementById('recipientId').value,
        type: document.getElementById('notifType').value,
        priority: document.getElementById('notifPriority').value,
        title: document.getElementById('notifTitle').value,
        message: document.getElementById('notifMessage').value,
        channels: document.getElementById('notifChannels').value.split(',').map(s => s.trim()),
      };

      try {
        const response = await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        const result = await response.json();
        if (result.success) {
          alert('Notification sent successfully!');
          document.getElementById('sendForm').reset();
        } else {
          alert('Failed to send: ' + result.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function broadcastNotification(event) {
      event.preventDefault();
      
      const body = {
        topic: document.getElementById('broadcastTopic').value,
        type: document.getElementById('broadcastType').value,
        title: document.getElementById('broadcastTitle').value,
        message: document.getElementById('broadcastMessage').value,
      };

      try {
        const response = await fetch('/api/notifications/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        const result = await response.json();
        if (result.success) {
          alert(\`Broadcast sent to \${result.result.sent} users\`);
          document.getElementById('broadcastForm').reset();
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function loadSubscriptions() {
      try {
        const response = await fetch(\`/api/users/\${currentUserId}/subscriptions\`);
        const data = await response.json();
        
        const container = document.getElementById('subscriptionsList');
        if (data.subscriptions.length === 0) {
          container.innerHTML = '<div class="empty-state">No subscriptions</div>';
        } else {
          container.innerHTML = data.subscriptions.map(s => \`
            <div class="notification">
              <div class="notification-header">
                <span class="notification-title">\${s.topic}</span>
                <button class="secondary" onclick="unsubscribe('\${s.topic}')">Unsubscribe</button>
              </div>
              <div style="font-size: 12px; color: #666;">
                Subscribed: \${new Date(s.subscribedAt).toLocaleDateString()}
              </div>
            </div>
          \`).join('');
        }
      } catch (error) {
        console.error('Failed to load subscriptions:', error);
      }
    }

    async function subscribeToTopic(event) {
      event.preventDefault();
      const topic = document.getElementById('subscribeTopic').value;
      
      try {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId, topic })
        });
        loadSubscriptions();
        document.getElementById('subscribeTopic').value = '';
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function unsubscribe(topic) {
      try {
        await fetch('/api/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId, topic })
        });
        loadSubscriptions();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      
      event.target.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    }

    // Start
    connectSSE();
    refreshNotifications();
    loadSubscriptions();
  </script>
</body>
</html>`;

// ============================================
// Startup
// ============================================

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Production-Ready Notification Server                  ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                      ║
║                                                               ║
║  Open http://localhost:${PORT} in your browser                 ║
║  to see the Notification Center                               ║
║                                                               ║
║  API Endpoints:                                               ║
║    GET  /events?userId={id}    - SSE stream                   ║
║    POST /api/notifications/send    - Send notification        ║
║    POST /api/notifications/broadcast - Broadcast to topic     ║
║    GET  /api/users/{id}/notifications - Get notifications     ║
║    POST /api/users/{id}/notifications/{id}/read - Mark read   ║
║    GET  /api/users/{id}/subscriptions - Get subscriptions     ║
║    POST /api/subscriptions     - Subscribe to topic           ║
║    GET  /api/templates         - Get all templates            ║
║    GET  /api/stats             - System stats                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Cleanup rate limiter periodically
setInterval(() => {
  getRateLimiter().cleanup();
}, 60000);
