/**
 * Production-Ready Notification System
 * 
 * Core types and interfaces for the notification service
 */

// ============================================
// Notification Types
// ============================================

export type NotificationType = 
  | "info" 
  | "success" 
  | "warning" 
  | "error" 
  | "progress" 
  | "announcement" 
  | "activity";

export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export type NotificationChannel = "in-app" | "email" | "push" | "sms";

export type NotificationStatus = "pending" | "sent" | "delivered" | "read" | "failed";

// ============================================
// Core Notification Interface
// ============================================

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
  expiresAt?: number;
  metadata: NotificationMetadata;
}

export interface NotificationMetadata {
  userId: string;
  channels: NotificationChannel[];
  status: NotificationStatus;
  readAt?: number;
  deliveredAt?: number;
  failedAt?: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  topic?: string;
  tags?: string[];
}

// ============================================
// User & Subscription Management
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
  subscriptions: Subscription[];
  createdAt: number;
  lastActiveAt: number;
}

export interface UserPreferences {
  channels: Record<NotificationChannel, ChannelPreferences>;
  quietHours?: QuietHours;
  digestFrequency?: "realtime" | "hourly" | "daily" | "weekly";
  digestTime?: string; // HH:mm format
  batchSimilar: boolean;
  maxNotificationsPerMinute: number;
}

export interface ChannelPreferences {
  enabled: boolean;
  minPriority: NotificationPriority;
  mutedTopics: string[];
}

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:mm format
  end: string;   // HH:mm format
  timezone: string;
}

export interface Subscription {
  id: string;
  topic: string;
  subscribedAt: number;
  filters?: SubscriptionFilter[];
}

export interface SubscriptionFilter {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "contains" | "in";
  value: unknown;
}

// ============================================
// Delivery & Retry
// ============================================

export interface DeliveryAttempt {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: "pending" | "success" | "failed";
  attemptedAt: number;
  completedAt?: number;
  errorMessage?: string;
  retryCount: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

// ============================================
// Batching & Throttling
// ============================================

export interface BatchConfig {
  enabled: boolean;
  maxSize: number;
  maxWaitMs: number;
  groupBy: "user" | "topic" | "type" | "priority";
}

export interface RateLimitConfig {
  maxPerSecond: number;
  maxPerMinute: number;
  maxPerHour: number;
  burstSize: number;
}

export interface ThrottleState {
  userId: string;
  count: number;
  windowStart: number;
  windowSizeMs: number;
}

// ============================================
// Templates
// ============================================

export interface NotificationTemplate {
  id: string;
  name: string;
  type: NotificationType;
  channels: NotificationChannel[];
  subject?: string; // For email
  title: string;
  body: string;
  variables: string[];
  defaultData?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface SendNotificationRequest {
  userId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
  topic?: string;
  tags?: string[];
  templateId?: string;
  templateData?: Record<string, unknown>;
  expiresInMinutes?: number;
}

export interface SubscribeRequest {
  userId: string;
  topic: string;
  filters?: SubscriptionFilter[];
}

export interface UnsubscribeRequest {
  userId: string;
  topic: string;
}

export interface UpdatePreferencesRequest {
  userId: string;
  preferences: Partial<UserPreferences>;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

// ============================================
// SSE Client Interface
// ============================================

export interface SSEClient {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
  lastPingAt: number;
  channels: Set<string>;
}

// ============================================
// Stats & Metrics
// ============================================

export interface NotificationStats {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  byChannel: Record<NotificationChannel, number>;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
  averageDeliveryTimeMs: number;
  activeConnections: number;
  queuedNotifications: number;
}
