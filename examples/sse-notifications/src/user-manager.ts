/**
 * User Management Module
 * 
 * Handles user subscriptions, preferences, and notification settings
 */

import type { 
  User, 
  UserPreferences, 
  Subscription, 
  ChannelPreferences,
  NotificationChannel,
  NotificationPriority,
  Notification,
  NotificationStatus,
} from "./types.ts";

// ============================================
// In-Memory Storage (Replace with DB in production)
// ============================================

const users = new Map<string, User>();
const subscriptions = new Map<string, Subscription[]>(); // userId -> subscriptions
const notifications = new Map<string, Notification[]>(); // userId -> notifications

// ============================================
// Default Values
// ============================================

const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  enabled: true,
  minPriority: "low",
  mutedTopics: [],
};

const DEFAULT_PREFERENCES: UserPreferences = {
  channels: {
    "in-app": { ...DEFAULT_CHANNEL_PREFERENCES },
    "email": { ...DEFAULT_CHANNEL_PREFERENCES, minPriority: "medium" },
    "push": { ...DEFAULT_CHANNEL_PREFERENCES, minPriority: "medium" },
    "sms": { ...DEFAULT_CHANNEL_PREFERENCES, minPriority: "high" },
  },
  batchSimilar: true,
  maxNotificationsPerMinute: 30,
  digestFrequency: "realtime",
};

// ============================================
// User Management
// ============================================

export function createUser(
  id: string,
  email: string,
  name: string,
  preferences?: Partial<UserPreferences>
): User {
  const user: User = {
    id,
    email,
    name,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      channels: {
        ...DEFAULT_PREFERENCES.channels,
        ...preferences?.channels,
      },
    } as UserPreferences,
    subscriptions: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  users.set(id, user);
  subscriptions.set(id, []);
  notifications.set(id, []);

  return user;
}

export function getUser(userId: string): User | undefined {
  return users.get(userId);
}

export function updateUser(userId: string, updates: Partial<Omit<User, "id" | "createdAt">>): User | undefined {
  const user = users.get(userId);
  if (!user) return undefined;

  const updated: User = {
    ...user,
    ...updates,
    preferences: updates.preferences 
      ? { ...user.preferences, ...updates.preferences } as UserPreferences
      : user.preferences,
    lastActiveAt: Date.now(),
  };

  users.set(userId, updated);
  return updated;
}

export function deleteUser(userId: string): boolean {
  users.delete(userId);
  subscriptions.delete(userId);
  notifications.delete(userId);
  return true;
}

export function getAllUsers(): User[] {
  return Array.from(users.values());
}

// ============================================
// Subscription Management
// ============================================

export function subscribeToTopic(
  userId: string,
  topic: string,
  filters?: Subscription["filters"]
): Subscription | undefined {
  const user = users.get(userId);
  if (!user) return undefined;

  const userSubs = subscriptions.get(userId) || [];
  
  // Check if already subscribed
  const existingIndex = userSubs.findIndex(s => s.topic === topic);
  if (existingIndex >= 0) {
    // Update existing subscription
    userSubs[existingIndex]!.filters = filters;
    return userSubs[existingIndex];
  }

  const subscription: Subscription = {
    id: generateId(),
    topic,
    subscribedAt: Date.now(),
    filters,
  };

  userSubs.push(subscription);
  subscriptions.set(userId, userSubs);
  
  // Update user's subscriptions array
  user.subscriptions = userSubs;
  users.set(userId, user);

  return subscription;
}

export function unsubscribeFromTopic(userId: string, topic: string): boolean {
  const userSubs = subscriptions.get(userId);
  if (!userSubs) return false;

  const filtered = userSubs.filter(s => s.topic !== topic);
  subscriptions.set(userId, filtered);

  // Update user's subscriptions array
  const user = users.get(userId);
  if (user) {
    user.subscriptions = filtered;
    users.set(userId, user);
  }

  return true;
}

export function getUserSubscriptions(userId: string): Subscription[] {
  return subscriptions.get(userId) || [];
}

export function isSubscribedToTopic(userId: string, topic: string): boolean {
  const userSubs = subscriptions.get(userId) || [];
  return userSubs.some(s => s.topic === topic);
}

// ============================================
// Preference Management
// ============================================

export function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): User | undefined {
  return updateUser(userId, { preferences });
}

export function updateChannelPreferences(
  userId: string,
  channel: NotificationChannel,
  prefs: Partial<ChannelPreferences>
): User | undefined {
  const user = users.get(userId);
  if (!user) return undefined;

  user.preferences.channels[channel] = {
    ...user.preferences.channels[channel],
    ...prefs,
  };

  users.set(userId, user);
  return user;
}

export function muteTopic(userId: string, topic: string): User | undefined {
  const user = users.get(userId);
  if (!user) return undefined;

  for (const channel of Object.keys(user.preferences.channels) as NotificationChannel[]) {
    const prefs = user.preferences.channels[channel];
    if (!prefs.mutedTopics.includes(topic)) {
      prefs.mutedTopics.push(topic);
    }
  }

  users.set(userId, user);
  return user;
}

export function unmuteTopic(userId: string, topic: string): User | undefined {
  const user = users.get(userId);
  if (!user) return undefined;

  for (const channel of Object.keys(user.preferences.channels) as NotificationChannel[]) {
    const prefs = user.preferences.channels[channel];
    prefs.mutedTopics = prefs.mutedTopics.filter(t => t !== topic);
  }

  users.set(userId, user);
  return user;
}

export function shouldSendToChannel(
  userId: string,
  channel: NotificationChannel,
  priority: NotificationPriority,
  topic?: string
): boolean {
  const user = users.get(userId);
  if (!user) return false;

  const prefs = user.preferences.channels[channel];
  if (!prefs || !prefs.enabled) return false;

  // Check priority
  const priorityLevels: Record<NotificationPriority, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };

  if (priorityLevels[priority] < priorityLevels[prefs.minPriority]) {
    return false;
  }

  // Check if topic is muted
  if (topic && prefs.mutedTopics.includes(topic)) {
    return false;
  }

  return true;
}

// ============================================
// Notification Persistence
// ============================================

export function saveNotification(notification: Notification): void {
  const userNotifs = notifications.get(notification.metadata.userId) || [];
  userNotifs.unshift(notification);
  
  // Keep only last 1000 notifications per user
  if (userNotifs.length > 1000) {
    userNotifs.length = 1000;
  }
  
  notifications.set(notification.metadata.userId, userNotifs);
}

export function getUserNotifications(
  userId: string,
  options: {
    status?: NotificationStatus;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  } = {}
): { notifications: Notification[]; total: number; unread: number } {
  const userNotifs = notifications.get(userId) || [];
  
  let filtered = userNotifs;
  
  if (options.status) {
    filtered = filtered.filter(n => n.metadata.status === options.status);
  }
  
  if (options.unreadOnly) {
    filtered = filtered.filter(n => n.metadata.status !== "read");
  }

  const total = filtered.length;
  const unread = userNotifs.filter(n => n.metadata.status !== "read").length;
  
  const offset = options.offset || 0;
  const limit = options.limit || 50;
  const paginated = filtered.slice(offset, offset + limit);

  return { notifications: paginated, total, unread };
}

export function markNotificationAsRead(userId: string, notificationId: string): Notification | undefined {
  const userNotifs = notifications.get(userId);
  if (!userNotifs) return undefined;

  const notif = userNotifs.find(n => n.id === notificationId);
  if (!notif) return undefined;

  notif.metadata.status = "read";
  notif.metadata.readAt = Date.now();
  
  return notif;
}

export function markAllNotificationsAsRead(userId: string): number {
  const userNotifs = notifications.get(userId);
  if (!userNotifs) return 0;

  let count = 0;
  for (const notif of userNotifs) {
    if (notif.metadata.status !== "read") {
      notif.metadata.status = "read";
      notif.metadata.readAt = Date.now();
      count++;
    }
  }

  return count;
}

export function deleteNotification(userId: string, notificationId: string): boolean {
  const userNotifs = notifications.get(userId);
  if (!userNotifs) return false;

  const index = userNotifs.findIndex(n => n.id === notificationId);
  if (index >= 0) {
    userNotifs.splice(index, 1);
    return true;
  }

  return false;
}

export function getNotificationStats(userId: string): {
  total: number;
  unread: number;
  read: number;
  byType: Record<string, number>;
} {
  const userNotifs = notifications.get(userId) || [];
  
  const byType: Record<string, number> = {};
  let unread = 0;
  let read = 0;

  for (const notif of userNotifs) {
    byType[notif.type] = (byType[notif.type] || 0) + 1;
    if (notif.metadata.status === "read") {
      read++;
    } else {
      unread++;
    }
  }

  return {
    total: userNotifs.length,
    unread,
    read,
    byType,
  };
}

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Initialize demo users
export function initializeDemoUsers(): void {
  createUser("user-1", "alice@example.com", "Alice", {
    channels: {
      "in-app": { enabled: true, minPriority: "low", mutedTopics: [] },
      "email": { enabled: true, minPriority: "medium", mutedTopics: [] },
      "push": { enabled: true, minPriority: "high", mutedTopics: [] },
      "sms": { enabled: false, minPriority: "urgent", mutedTopics: [] },
    },
  });

  createUser("user-2", "bob@example.com", "Bob", {
    channels: {
      "in-app": { enabled: true, minPriority: "low", mutedTopics: [] },
      "email": { enabled: true, minPriority: "low", mutedTopics: [] },
      "push": { enabled: false, minPriority: "high", mutedTopics: [] },
      "sms": { enabled: false, minPriority: "urgent", mutedTopics: [] },
    },
    digestFrequency: "hourly",
  });

  createUser("user-3", "charlie@example.com", "Charlie", {
    channels: {
      "in-app": { enabled: true, minPriority: "medium", mutedTopics: [] },
      "email": { enabled: false, minPriority: "high", mutedTopics: [] },
      "push": { enabled: true, minPriority: "medium", mutedTopics: [] },
      "sms": { enabled: true, minPriority: "urgent", mutedTopics: [] },
    },
  });

  // Subscribe demo users to topics
  subscribeToTopic("user-1", "system.announcements");
  subscribeToTopic("user-1", "user.activity");
  subscribeToTopic("user-2", "system.announcements");
  subscribeToTopic("user-3", "user.activity");
}
