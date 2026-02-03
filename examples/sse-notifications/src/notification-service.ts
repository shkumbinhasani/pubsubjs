/**
 * Notification Service
 * 
 * Core service for sending notifications with retry logic, batching, and delivery
 */

import type { 
  Notification, 
  SendNotificationRequest, 
  NotificationChannel,
  DeliveryAttempt,
  RetryPolicy,
  SSEClient,
} from "./types.ts";
import { 
  getUser, 
  shouldSendToChannel, 
  saveNotification,
  getAllUsers,
  isSubscribedToTopic,
} from "./user-manager.ts";
import { getTemplate, renderTemplate } from "./template-manager.ts";
import { getRateLimiter } from "./rate-limiter.ts";

// ============================================
// Configuration
// ============================================

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
};

// ============================================
// SSE Client Management
// ============================================

const sseClients = new Map<string, SSEClient>();
const deliveryAttempts = new Map<string, DeliveryAttempt[]>();

// ============================================
// Public API
// ============================================

export function registerSSEClient(client: SSEClient): void {
  sseClients.set(client.id, client);
}

export function unregisterSSEClient(clientId: string): void {
  sseClients.delete(clientId);
}

export function getConnectedClients(): SSEClient[] {
  return Array.from(sseClients.values());
}

export function getClientByUserId(userId: string): SSEClient | undefined {
  for (const client of sseClients.values()) {
    if (client.userId === userId) {
      return client;
    }
  }
  return undefined;
}

// ============================================
// Send Notification
// ============================================

export async function sendNotification(
  request: SendNotificationRequest
): Promise<{ success: boolean; notification?: Notification; error?: string }> {
  const user = getUser(request.userId);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Check rate limit
  const rateLimiter = getRateLimiter();
  if (!rateLimiter.canProceed(request.userId)) {
    return { success: false, error: "Rate limit exceeded" };
  }

  // Use template if provided
  let title = request.title;
  let message = request.message;

  if (request.templateId) {
    const template = getTemplate(request.templateId);
    if (template) {
      const rendered = renderTemplate(template, request.templateData || {});
      title = rendered.title;
      message = rendered.body;
    }
  }

  // Determine channels
  const channels = request.channels || ["in-app"];
  const priority = request.priority || "medium";

  // Create notification
  const notification: Notification = {
    id: generateId(),
    type: request.type,
    priority,
    title,
    message,
    data: request.data,
    timestamp: Date.now(),
    expiresAt: request.expiresInMinutes 
      ? Date.now() + request.expiresInMinutes * 60000 
      : undefined,
    metadata: {
      userId: request.userId,
      channels,
      status: "pending",
      retryCount: 0,
      maxRetries: DEFAULT_RETRY_POLICY.maxRetries,
      topic: request.topic,
      tags: request.tags,
    },
  };

  // Save notification
  saveNotification(notification);

  // Record rate limit attempt
  rateLimiter.recordAttempt(request.userId);

  // Deliver to channels
  for (const channel of channels) {
    if (shouldSendToChannel(request.userId, channel, priority, request.topic)) {
      await deliverToChannel(notification, channel);
    }
  }

  return { success: true, notification };
}

// ============================================
// Broadcast to Topic
// ============================================

export async function broadcastToTopic(
  topic: string,
  request: Omit<SendNotificationRequest, "userId">
): Promise<{ sent: number; failed: number }> {
  const users = getAllUsers();
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (isSubscribedToTopic(user.id, topic)) {
      const result = await sendNotification({
        ...request,
        userId: user.id,
        topic,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed };
}

// ============================================
// Delivery Logic
// ============================================

async function deliverToChannel(
  notification: Notification,
  channel: NotificationChannel
): Promise<boolean> {
  const attempt: DeliveryAttempt = {
    id: generateId(),
    notificationId: notification.id,
    channel,
    status: "pending",
    attemptedAt: Date.now(),
    retryCount: notification.metadata.retryCount,
  };

  // Record attempt
  const attempts = deliveryAttempts.get(notification.id) || [];
  attempts.push(attempt);
  deliveryAttempts.set(notification.id, attempts);

  try {
    let success = false;

    switch (channel) {
      case "in-app":
        success = await deliverInApp(notification);
        break;
      case "email":
        success = await deliverEmail(notification);
        break;
      case "push":
        success = await deliverPush(notification);
        break;
      case "sms":
        success = await deliverSMS(notification);
        break;
    }

    if (success) {
      attempt.status = "success";
      attempt.completedAt = Date.now();
      notification.metadata.status = "delivered";
      notification.metadata.deliveredAt = Date.now();
    } else {
      throw new Error(`Delivery to ${channel} failed`);
    }

    return success;
  } catch (error) {
    attempt.status = "failed";
    attempt.completedAt = Date.now();
    attempt.errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Schedule retry if needed
    if (notification.metadata.retryCount < notification.metadata.maxRetries) {
      scheduleRetry(notification, channel);
    } else {
      notification.metadata.status = "failed";
      notification.metadata.failedAt = Date.now();
      notification.metadata.errorMessage = attempt.errorMessage;
    }

    return false;
  }
}

async function deliverInApp(notification: Notification): Promise<boolean> {
  const client = getClientByUserId(notification.metadata.userId);
  
  if (!client) {
    // User not connected, but still store for later
    return true;
  }

  try {
    const data = JSON.stringify({
      type: "notification",
      notification,
    });

    client.controller.enqueue(
      new TextEncoder().encode(`event: notification\ndata: ${data}\n\n`)
    );

    return true;
  } catch {
    return false;
  }
}

async function deliverEmail(notification: Notification): Promise<boolean> {
  // Simulate email delivery
  // In production, integrate with email service (SendGrid, AWS SES, etc.)
  console.log(`[Email] To: ${notification.metadata.userId}, Subject: ${notification.title}`);
  await simulateDelay(100);
  return true;
}

async function deliverPush(notification: Notification): Promise<boolean> {
  // Simulate push notification delivery
  // In production, integrate with FCM, APNs, etc.
  console.log(`[Push] To: ${notification.metadata.userId}, Title: ${notification.title}`);
  await simulateDelay(50);
  return true;
}

async function deliverSMS(notification: Notification): Promise<boolean> {
  // Simulate SMS delivery
  // In production, integrate with Twilio, AWS SNS, etc.
  console.log(`[SMS] To: ${notification.metadata.userId}, Message: ${notification.message}`);
  await simulateDelay(200);
  return true;
}

// ============================================
// Retry Logic
// ============================================

function scheduleRetry(notification: Notification, channel: NotificationChannel): void {
  const delay = calculateRetryDelay(notification.metadata.retryCount);
  
  notification.metadata.retryCount++;

  setTimeout(() => {
    deliverToChannel(notification, channel);
  }, delay);
}

function calculateRetryDelay(retryCount: number): number {
  const delay = DEFAULT_RETRY_POLICY.initialDelayMs * 
    Math.pow(DEFAULT_RETRY_POLICY.backoffMultiplier, retryCount);
  return Math.min(delay, DEFAULT_RETRY_POLICY.maxDelayMs);
}

// ============================================
// Batch Processing
// ============================================

interface BatchItem {
  notification: Notification;
  channel: NotificationChannel;
}

const batchQueue: BatchItem[] = [];
let batchTimeout: Timer | null = null;

export function queueForBatch(
  notification: Notification,
  channel: NotificationChannel
): void {
  batchQueue.push({ notification, channel });

  if (!batchTimeout) {
    batchTimeout = setTimeout(processBatch, 1000);
  }
}

async function processBatch(): Promise<void> {
  if (batchQueue.length === 0) {
    batchTimeout = null;
    return;
  }

  // Group by channel
  const byChannel = new Map<NotificationChannel, BatchItem[]>();
  
  for (const item of batchQueue.splice(0, batchQueue.length)) {
    const items = byChannel.get(item.channel) || [];
    items.push(item);
    byChannel.set(item.channel, items);
  }

  // Process each channel batch
  for (const [channel, items] of byChannel) {
    console.log(`[Batch] Processing ${items.length} notifications for ${channel}`);
    
    for (const item of items) {
      await deliverToChannel(item.notification, item.channel);
    }
  }

  batchTimeout = null;
}

// ============================================
// Statistics
// ============================================

export function getDeliveryStats(): {
  totalAttempts: number;
  successful: number;
  failed: number;
  byChannel: Record<NotificationChannel, { success: number; failed: number }>;
} {
  let totalAttempts = 0;
  let successful = 0;
  let failed = 0;
  const byChannel: Record<NotificationChannel, { success: number; failed: number }> = {
    "in-app": { success: 0, failed: 0 },
    "email": { success: 0, failed: 0 },
    "push": { success: 0, failed: 0 },
    "sms": { success: 0, failed: 0 },
  };

  for (const attempts of deliveryAttempts.values()) {
    for (const attempt of attempts) {
      totalAttempts++;
      
      if (attempt.status === "success") {
        successful++;
        byChannel[attempt.channel].success++;
      } else if (attempt.status === "failed") {
        failed++;
        byChannel[attempt.channel].failed++;
      }
    }
  }

  return {
    totalAttempts,
    successful,
    failed,
    byChannel,
  };
}

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function simulateDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
