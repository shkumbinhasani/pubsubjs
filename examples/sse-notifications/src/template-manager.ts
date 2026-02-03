/**
 * Notification Templates Module
 * 
 * Manages notification templates with variable substitution
 */

import type { NotificationTemplate, NotificationType, NotificationChannel } from "./types.ts";

// ============================================
// In-Memory Storage
// ============================================

const templates = new Map<string, NotificationTemplate>();

// ============================================
// Template Management
// ============================================

export function createTemplate(
  name: string,
  type: NotificationType,
  channels: NotificationChannel[],
  content: {
    subject?: string;
    title: string;
    body: string;
  },
  variables: string[],
  defaultData?: Record<string, unknown>
): NotificationTemplate {
  const template: NotificationTemplate = {
    id: generateId(),
    name,
    type,
    channels,
    subject: content.subject,
    title: content.title,
    body: content.body,
    variables,
    defaultData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  templates.set(template.id, template);
  return template;
}

export function getTemplate(templateId: string): NotificationTemplate | undefined {
  return templates.get(templateId);
}

export function getTemplateByName(name: string): NotificationTemplate | undefined {
  for (const template of templates.values()) {
    if (template.name === name) {
      return template;
    }
  }
  return undefined;
}

export function updateTemplate(
  templateId: string,
  updates: Partial<Omit<NotificationTemplate, "id" | "createdAt">>
): NotificationTemplate | undefined {
  const template = templates.get(templateId);
  if (!template) return undefined;

  const updated: NotificationTemplate = {
    ...template,
    ...updates,
    updatedAt: Date.now(),
  };

  templates.set(templateId, updated);
  return updated;
}

export function deleteTemplate(templateId: string): boolean {
  return templates.delete(templateId);
}

export function getAllTemplates(): NotificationTemplate[] {
  return Array.from(templates.values());
}

// ============================================
// Template Rendering
// ============================================

export function renderTemplate(
  template: NotificationTemplate,
  data: Record<string, unknown>
): { subject?: string; title: string; body: string } {
  const mergedData = { ...template.defaultData, ...data };

  return {
    subject: template.subject ? interpolate(template.subject, mergedData) : undefined,
    title: interpolate(template.title, mergedData),
    body: interpolate(template.body, mergedData),
  };
}

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    return value !== undefined ? String(value) : match;
  });
}

// ============================================
// Default Templates
// ============================================

export function initializeDefaultTemplates(): void {
  // Welcome template
  createTemplate(
    "welcome",
    "info",
    ["in-app", "email"],
    {
      subject: "Welcome to {{appName}}!",
      title: "Welcome {{name}}!",
      body: "Hi {{name}}, welcome to {{appName}}! We're excited to have you on board.",
    },
    ["name", "appName"],
    { appName: "Our App" }
  );

  // Password reset template
  createTemplate(
    "password-reset",
    "info",
    ["email"],
    {
      subject: "Password Reset Request",
      title: "Password Reset",
      body: "You requested a password reset. Click the link below to reset your password: {{resetLink}}. This link expires in {{expiresIn}} hours.",
    },
    ["resetLink", "expiresIn"],
    { expiresIn: "24" }
  );

  // Order confirmation template
  createTemplate(
    "order-confirmation",
    "success",
    ["in-app", "email", "push"],
    {
      subject: "Order #{{orderId}} Confirmed",
      title: "Order Confirmed",
      body: "Your order #{{orderId}} for {{total}} has been confirmed and will be shipped soon.",
    },
    ["orderId", "total"]
  );

  // Security alert template
  createTemplate(
    "security-alert",
    "warning",
    ["in-app", "email", "push", "sms"],
    {
      subject: "Security Alert: {{alertType}}",
      title: "Security Alert",
      body: "We detected {{alertType}} from {{location}} at {{time}}. If this wasn't you, please secure your account immediately.",
    },
    ["alertType", "location", "time"]
  );

  // System maintenance template
  createTemplate(
    "system-maintenance",
    "announcement",
    ["in-app", "email"],
    {
      subject: "Scheduled Maintenance",
      title: "System Maintenance",
      body: "We'll be performing scheduled maintenance on {{date}} from {{startTime}} to {{endTime}}. {{serviceName}} may be unavailable during this time.",
    },
    ["date", "startTime", "endTime", "serviceName"],
    { serviceName: "Our services" }
  );

  // Payment failed template
  createTemplate(
    "payment-failed",
    "error",
    ["in-app", "email"],
    {
      subject: "Payment Failed for Order #{{orderId}}",
      title: "Payment Failed",
      body: "We couldn't process your payment of {{amount}} for order #{{orderId}}. Please update your payment method and try again.",
    },
    ["orderId", "amount"]
  );

  // New follower template
  createTemplate(
    "new-follower",
    "activity",
    ["in-app", "push"],
    {
      title: "New Follower",
      body: "{{followerName}} started following you!",
    },
    ["followerName"]
  );

  // Progress update template
  createTemplate(
    "progress-update",
    "progress",
    ["in-app"],
    {
      title: "{{taskName}} Progress",
      body: "{{taskName}} is {{progress}}% complete. {{status}}",
    },
    ["taskName", "progress", "status"]
  );
}

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
