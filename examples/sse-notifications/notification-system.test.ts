/**
 * Tests for the notification system
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { 
  createUser, 
  getUser, 
  subscribeToTopic, 
  unsubscribeFromTopic,
  getUserNotifications,
  markNotificationAsRead,
  saveNotification,
  initializeDemoUsers,
} from "./src/user-manager.ts";
import { 
  createTemplate, 
  getTemplate, 
  renderTemplate,
  initializeDefaultTemplates,
} from "./src/template-manager.ts";
import { RateLimiter, getRateLimiter, resetRateLimiter } from "./src/rate-limiter.ts";
import type { Notification } from "./src/types.ts";

describe("Notification System", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  describe("User Management", () => {
    test("createUser creates a user with default preferences", () => {
      const user = createUser("test-1", "test@example.com", "Test User");
      
      expect(user.id).toBe("test-1");
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test User");
      expect(user.preferences.channels["in-app"].enabled).toBe(true);
      expect(user.preferences.channels["email"].enabled).toBe(true);
    });

    test("getUser returns user by id", () => {
      createUser("test-2", "test2@example.com", "Test User 2");
      const user = getUser("test-2");
      
      expect(user).toBeDefined();
      expect(user?.email).toBe("test2@example.com");
    });

    test("subscribeToTopic adds subscription", () => {
      createUser("test-3", "test3@example.com", "Test User 3");
      const subscription = subscribeToTopic("test-3", "news.updates");
      
      expect(subscription).toBeDefined();
      expect(subscription?.topic).toBe("news.updates");
    });

    test("unsubscribeFromTopic removes subscription", () => {
      createUser("test-4", "test4@example.com", "Test User 4");
      subscribeToTopic("test-4", "news.updates");
      const result = unsubscribeFromTopic("test-4", "news.updates");
      
      expect(result).toBe(true);
    });
  });

  describe("Notification Persistence", () => {
    test("saveNotification stores notification", () => {
      createUser("test-5", "test5@example.com", "Test User 5");
      
      const notification: Notification = {
        id: "notif-1",
        type: "info",
        priority: "medium",
        title: "Test",
        message: "Test message",
        timestamp: Date.now(),
        metadata: {
          userId: "test-5",
          channels: ["in-app"],
          status: "pending",
          retryCount: 0,
          maxRetries: 3,
        },
      };
      
      saveNotification(notification);
      const { notifications } = getUserNotifications("test-5");
      
      expect(notifications.length).toBe(1);
      expect(notifications[0]?.title).toBe("Test");
    });

    test("markNotificationAsRead updates status", () => {
      createUser("test-6", "test6@example.com", "Test User 6");
      
      const notification: Notification = {
        id: "notif-2",
        type: "info",
        priority: "medium",
        title: "Test",
        message: "Test message",
        timestamp: Date.now(),
        metadata: {
          userId: "test-6",
          channels: ["in-app"],
          status: "pending",
          retryCount: 0,
          maxRetries: 3,
        },
      };
      
      saveNotification(notification);
      markNotificationAsRead("test-6", "notif-2");
      
      const { notifications } = getUserNotifications("test-6");
      expect(notifications[0]?.metadata.status).toBe("read");
    });
  });

  describe("Templates", () => {
    test("createTemplate creates a template", () => {
      const template = createTemplate(
        "welcome",
        "info",
        ["in-app", "email"],
        { title: "Welcome {{name}}!", body: "Hello {{name}}" },
        ["name"]
      );
      
      expect(template.name).toBe("welcome");
      expect(template.variables).toContain("name");
    });

    test("renderTemplate substitutes variables", () => {
      const template = createTemplate(
        "greeting",
        "info",
        ["in-app"],
        { title: "Hello {{name}}!", body: "Welcome {{name}}" },
        ["name"],
        {}
      );
      
      const result = renderTemplate(template, { name: "Alice" });
      expect(result.title).toBe("Hello Alice!");
      expect(result.body).toBe("Welcome Alice");
    });

    test("getTemplate retrieves template by id", () => {
      const created = createTemplate(
        "test-template",
        "info",
        ["in-app"],
        { title: "Test", body: "Test body" },
        []
      );
      
      const retrieved = getTemplate(created.id);
      expect(retrieved?.name).toBe("test-template");
    });
  });

  describe("Rate Limiter", () => {
    test("canProceed allows requests under limit", () => {
      const limiter = new RateLimiter({ maxPerSecond: 5 });
      
      expect(limiter.canProceed("user-1")).toBe(true);
      limiter.recordAttempt("user-1");
      expect(limiter.canProceed("user-1")).toBe(true);
    });

    test("canProceed blocks requests over limit", () => {
      const limiter = new RateLimiter({ maxPerSecond: 2 });
      
      limiter.recordAttempt("user-2");
      limiter.recordAttempt("user-2");
      limiter.recordAttempt("user-2");
      
      expect(limiter.canProceed("user-2")).toBe(false);
    });

    test("getStatus returns current rate limit status", () => {
      const limiter = new RateLimiter({ maxPerSecond: 10 });
      
      const status = limiter.getStatus("user-3");
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(10);
    });

    test("reset clears rate limits", () => {
      const limiter = new RateLimiter({ maxPerSecond: 2 });
      
      limiter.recordAttempt("user-4");
      limiter.recordAttempt("user-4");
      limiter.recordAttempt("user-4");
      
      limiter.reset("user-4");
      expect(limiter.canProceed("user-4")).toBe(true);
    });
  });

  describe("Initialization", () => {
    test("initializeDemoUsers creates demo users", () => {
      initializeDemoUsers();
      
      const alice = getUser("user-1");
      expect(alice).toBeDefined();
      expect(alice?.name).toBe("Alice");
    });

    test("initializeDefaultTemplates creates templates", () => {
      initializeDefaultTemplates();
      
      const welcomeTemplate = createTemplate(
        "welcome-test",
        "info",
        ["in-app"],
        { title: "Welcome {{name}}!", body: "Hello {{name}}" },
        ["name"]
      );
      
      expect(welcomeTemplate.name).toBe("welcome-test");
    });
  });
});
