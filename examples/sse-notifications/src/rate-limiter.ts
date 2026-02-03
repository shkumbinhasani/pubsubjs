/**
 * Rate Limiter Module
 * 
 * Implements token bucket algorithm for rate limiting notifications per user
 */

import type { RateLimitConfig, ThrottleState } from "./types.ts";

// ============================================
// Default Configuration
// ============================================

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxPerSecond: 10,
  maxPerMinute: 100,
  maxPerHour: 1000,
  burstSize: 20,
};

// ============================================
// In-Memory State
// ============================================

const throttleStates = new Map<string, Map<number, ThrottleState>>();

// ============================================
// Rate Limiting Logic
// ============================================

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  /**
   * Check if a user can send a notification
   * Returns true if allowed, false if rate limited
   */
  canProceed(userId: string): boolean {
    const now = Date.now();
    const userStates = this.getUserStates(userId);

    // Check per-second limit
    if (!this.checkWindow(userStates, 1000, this.config.maxPerSecond, now)) {
      return false;
    }

    // Check per-minute limit
    if (!this.checkWindow(userStates, 60000, this.config.maxPerMinute, now)) {
      return false;
    }

    // Check per-hour limit
    if (!this.checkWindow(userStates, 3600000, this.config.maxPerHour, now)) {
      return false;
    }

    return true;
  }

  /**
   * Record a notification attempt for rate limiting
   */
  recordAttempt(userId: string): void {
    const now = Date.now();
    const userStates = this.getUserStates(userId);

    // Update all windows
    this.updateWindow(userStates, 1000, this.config.maxPerSecond, now);
    this.updateWindow(userStates, 60000, this.config.maxPerMinute, now);
    this.updateWindow(userStates, 3600000, this.config.maxPerHour, now);
  }

  /**
   * Get current rate limit status for a user
   */
  getStatus(userId: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limits: {
      perSecond: { current: number; limit: number };
      perMinute: { current: number; limit: number };
      perHour: { current: number; limit: number };
    };
  } {
    const now = Date.now();
    const userStates = this.getUserStates(userId);

    const perSecond = this.getWindowStatus(userStates, 1000, this.config.maxPerSecond, now);
    const perMinute = this.getWindowStatus(userStates, 60000, this.config.maxPerMinute, now);
    const perHour = this.getWindowStatus(userStates, 3600000, this.config.maxPerHour, now);

    const allowed = perSecond.remaining > 0 && perMinute.remaining > 0 && perHour.remaining > 0;
    
    return {
      allowed,
      remaining: Math.min(perSecond.remaining, perMinute.remaining, perHour.remaining),
      resetAt: Math.min(perSecond.resetAt, perMinute.resetAt, perHour.resetAt),
      limits: {
        perSecond: { current: perSecond.current, limit: this.config.maxPerSecond },
        perMinute: { current: perMinute.current, limit: this.config.maxPerMinute },
        perHour: { current: perHour.current, limit: this.config.maxPerHour },
      },
    };
  }

  /**
   * Reset rate limits for a user
   */
  reset(userId: string): void {
    throttleStates.delete(userId);
  }

  /**
   * Clean up old entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [userId, states] of throttleStates.entries()) {
      for (const [windowSize, state] of states.entries()) {
        if (now - state.windowStart > windowSize) {
          states.delete(windowSize);
        }
      }
      if (states.size === 0) {
        throttleStates.delete(userId);
      }
    }
  }

  // ============================================
// Private Methods
// ============================================

  private getUserStates(userId: string): Map<number, ThrottleState> {
    let states = throttleStates.get(userId);
    if (!states) {
      states = new Map();
      throttleStates.set(userId, states);
    }
    return states;
  }

  private checkWindow(
    states: Map<number, ThrottleState>,
    windowSizeMs: number,
    maxRequests: number,
    now: number
  ): boolean {
    const state = states.get(windowSizeMs);
    
    if (!state) {
      return true; // No state means first request
    }

    // Check if window has expired
    if (now - state.windowStart >= windowSizeMs) {
      return true; // Window expired, can proceed
    }

    // Check if under limit
    return state.count < maxRequests;
  }

  private updateWindow(
    states: Map<number, ThrottleState>,
    windowSizeMs: number,
    maxRequests: number,
    now: number
  ): void {
    let state = states.get(windowSizeMs);

    if (!state || now - state.windowStart >= windowSizeMs) {
      // Create new window
      state = {
        userId: "", // Will be set by caller
        count: 0,
        windowStart: now,
        windowSizeMs,
      };
    }

    state.count++;
    states.set(windowSizeMs, state);
  }

  private getWindowStatus(
    states: Map<number, ThrottleState>,
    windowSizeMs: number,
    maxRequests: number,
    now: number
  ): { current: number; remaining: number; resetAt: number } {
    const state = states.get(windowSizeMs);

    if (!state || now - state.windowStart >= windowSizeMs) {
      return {
        current: 0,
        remaining: maxRequests,
        resetAt: now + windowSizeMs,
      };
    }

    return {
      current: state.count,
      remaining: Math.max(0, maxRequests - state.count),
      resetAt: state.windowStart + windowSizeMs,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(config);
  }
  return globalRateLimiter;
}

export function resetRateLimiter(): void {
  globalRateLimiter = null;
}
