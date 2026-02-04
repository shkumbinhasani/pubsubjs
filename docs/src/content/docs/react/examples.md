---
title: React Examples
description: Real-world examples using PubSubJS with React
---

## Chat Application

A real-time chat with typing indicators and online status.

```tsx
// events.ts
import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

export const chatEvents = defineEvent([
  {
    name: "chat.message",
    schema: z.object({
      id: z.string(),
      userId: z.string(),
      username: z.string(),
      text: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "chat.typing",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      isTyping: z.boolean(),
    }),
  },
  {
    name: "user.status",
    schema: z.object({
      userId: z.string(),
      status: z.enum(["online", "offline"]),
    }),
  },
]);
```

```tsx
// ChatRoom.tsx
import { useState, useEffect, useRef } from "react";
import { useSubscribe, usePublish } from "./pubsub";

export function ChatRoom({ userId, username }) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [input, setInput] = useState("");
  const { publish } = usePublish();
  const typingTimeout = useRef(null);

  // Subscribe to messages
  useSubscribe(
    "chat.message",
    (payload) => {
      setMessages((prev) => [...prev, payload]);
    },
    []
  );

  // Subscribe to typing indicators
  useSubscribe(
    "chat.typing",
    (payload) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (payload.isTyping) {
          next.set(payload.userId, payload.username);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    },
    []
  );

  // Announce online status
  useEffect(() => {
    publish("user.status", { userId, status: "online" });
    return () => {
      publish("user.status", { userId, status: "offline" });
    };
  }, [userId, username, publish]);

  // Handle typing indicator
  const handleInputChange = (e) => {
    setInput(e.target.value);

    // Send typing indicator
    publish("chat.typing", { userId, username, isTyping: true });

    // Clear previous timeout
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    // Stop typing after 2 seconds
    typingTimeout.current = setTimeout(() => {
      publish("chat.typing", { userId, username, isTyping: false });
    }, 2000);
  };

  const sendMessage = () => {
    if (!input.trim()) return;

    publish("chat.message", {
      id: crypto.randomUUID(),
      userId,
      username,
      text: input,
      timestamp: Date.now(),
    });

    setInput("");
    publish("chat.typing", { userId, username, isTyping: false });
  };

  return (
    <div className="chat-room">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className="message">
            <strong>{msg.username}:</strong> {msg.text}
          </div>
        ))}
      </div>

      {typingUsers.size > 0 && (
        <div className="typing-indicator">
          {Array.from(typingUsers.values()).join(", ")} typing...
        </div>
      )}

      <div className="input-area">
        <input
          value={input}
          onChange={handleInputChange}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
```

## Live Dashboard

Real-time metrics dashboard with charts.

```tsx
// events.ts
export const dashboardEvents = defineEvent([
  {
    name: "metrics.cpu",
    schema: z.object({
      value: z.number(),
      timestamp: z.number(),
    }),
  },
  {
    name: "metrics.memory",
    schema: z.object({
      used: z.number(),
      total: z.number(),
      timestamp: z.number(),
    }),
  },
  {
    name: "metrics.requests",
    schema: z.object({
      count: z.number(),
      errorRate: z.number(),
      avgLatency: z.number(),
      timestamp: z.number(),
    }),
  },
]);
```

```tsx
// Dashboard.tsx
import { useState } from "react";
import { useSubscribe } from "./pubsub";
import { LineChart } from "./LineChart";

export function Dashboard() {
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [requestMetrics, setRequestMetrics] = useState(null);

  useSubscribe(
    "metrics.cpu",
    (payload) => {
      setCpuHistory((prev) => [...prev.slice(-60), payload]);
    },
    []
  );

  useSubscribe(
    "metrics.memory",
    (payload) => {
      setMemoryHistory((prev) => [...prev.slice(-60), payload]);
    },
    []
  );

  useSubscribe(
    "metrics.requests",
    (payload) => {
      setRequestMetrics(payload);
    },
    []
  );

  return (
    <div className="dashboard">
      <div className="chart-grid">
        <div className="chart-card">
          <h3>CPU Usage</h3>
          <LineChart
            data={cpuHistory}
            xKey="timestamp"
            yKey="value"
            color="#3b82f6"
          />
        </div>

        <div className="chart-card">
          <h3>Memory Usage</h3>
          <LineChart
            data={memoryHistory}
            xKey="timestamp"
            yKey={(d) => (d.used / d.total) * 100}
            color="#10b981"
          />
        </div>
      </div>

      {requestMetrics && (
        <div className="stats-row">
          <StatCard
            label="Requests/sec"
            value={requestMetrics.count}
          />
          <StatCard
            label="Error Rate"
            value={`${(requestMetrics.errorRate * 100).toFixed(2)}%`}
            alert={requestMetrics.errorRate > 0.05}
          />
          <StatCard
            label="Avg Latency"
            value={`${requestMetrics.avgLatency}ms`}
            alert={requestMetrics.avgLatency > 200}
          />
        </div>
      )}
    </div>
  );
}
```

## Notifications System

Toast notifications with different types.

```tsx
// Notifications.tsx
import { useState, useCallback } from "react";
import { useSubscribe } from "./pubsub";

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((notification) => {
    const id = crypto.randomUUID();
    setNotifications((prev) => [...prev, { ...notification, id }]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  useSubscribe("notification.show", addNotification, [addNotification]);

  const dismiss = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <>
      {children}
      <div className="notification-container">
        {notifications.map((n) => (
          <div key={n.id} className={`notification notification-${n.type}`}>
            <span>{n.message}</span>
            <button onClick={() => dismiss(n.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}

// Usage anywhere in the app
function SomeComponent() {
  const { publish } = usePublish();

  const showSuccess = () => {
    publish("notification.show", {
      type: "success",
      message: "Operation completed successfully!",
    });
  };

  const showError = () => {
    publish("notification.show", {
      type: "error",
      message: "Something went wrong. Please try again.",
    });
  };

  return (
    <div>
      <button onClick={showSuccess}>Success</button>
      <button onClick={showError}>Error</button>
    </div>
  );
}
```

## Collaborative Editor

Real-time collaborative text editing.

```tsx
// CollaborativeEditor.tsx
import { useState, useEffect, useRef } from "react";
import { useSubscribe, usePublish } from "./pubsub";

export function CollaborativeEditor({ documentId, userId }) {
  const [content, setContent] = useState("");
  const [cursors, setCursors] = useState(new Map());
  const { publish } = usePublish();
  const editorRef = useRef(null);

  // Subscribe to document changes
  useSubscribe(
    "doc.change",
    (payload) => {
      if (payload.documentId !== documentId) return;
      if (payload.userId === userId) return; // Ignore own changes

      setContent(payload.content);
    },
    [documentId, userId]
  );

  // Subscribe to cursor positions
  useSubscribe(
    "doc.cursor",
    (payload) => {
      if (payload.documentId !== documentId) return;
      if (payload.userId === userId) return;

      setCursors((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, {
          position: payload.position,
          username: payload.username,
          color: payload.color,
        });
        return next;
      });
    },
    [documentId, userId]
  );

  // Handle content changes
  const handleChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);

    publish("doc.change", {
      documentId,
      userId,
      content: newContent,
      timestamp: Date.now(),
    });
  };

  // Handle cursor movement
  const handleSelect = () => {
    const position = editorRef.current?.selectionStart ?? 0;

    publish("doc.cursor", {
      documentId,
      userId,
      username: "User",
      position,
      color: "#3b82f6",
    });
  };

  return (
    <div className="collaborative-editor">
      <textarea
        ref={editorRef}
        value={content}
        onChange={handleChange}
        onSelect={handleSelect}
        onClick={handleSelect}
      />

      {/* Render remote cursors */}
      {Array.from(cursors.entries()).map(([id, cursor]) => (
        <div
          key={id}
          className="remote-cursor"
          style={{
            left: calculateCursorPosition(cursor.position),
            backgroundColor: cursor.color,
          }}
        >
          <span className="cursor-label">{cursor.username}</span>
        </div>
      ))}
    </div>
  );
}
```

## Next Steps

- [Setup](/react/setup/) - Configure PubSubJS for React
- [Hooks](/react/hooks/) - Hook API reference
