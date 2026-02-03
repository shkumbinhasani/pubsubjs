/**
 * Service Discovery and Health Check System
 * Manages service registration, discovery, and health monitoring
 */

import { RedisTransport } from "@pubsubjs/transport-redis";

export interface ServiceInstance {
  id: string;
  name: string;
  type: ServiceType;
  host: string;
  port: number;
  healthCheckUrl: string;
  metadata?: Record<string, unknown>;
  registeredAt: number;
  lastHeartbeat: number;
  status: ServiceStatus;
}

export type ServiceType = 
  | "user" 
  | "order" 
  | "inventory" 
  | "payment" 
  | "shipping" 
  | "notification" 
  | "gateway";

export type ServiceStatus = "healthy" | "unhealthy" | "degraded" | "unknown";

export interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  responseTime: number;
  message?: string;
}

export interface ServiceHealth {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  checks: HealthCheck[];
  timestamp: number;
}

export interface ServiceDiscoveryOptions {
  redisUrl: string;
  heartbeatInterval?: number;
  healthCheckInterval?: number;
  serviceTimeout?: number;
}

export class ServiceDiscovery {
  private services = new Map<string, ServiceInstance>();
  private heartbeatTimers = new Map<string, Timer>();
  private healthCheckTimers = new Map<string, Timer>();
  private readonly options: Required<ServiceDiscoveryOptions>;
  private redis: Redis | null = null;

  constructor(options: ServiceDiscoveryOptions) {
    this.options = {
      redisUrl: options.redisUrl,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      healthCheckInterval: options.healthCheckInterval ?? 60000,
      serviceTimeout: options.serviceTimeout ?? 120000,
    };
  }

  async initialize(): Promise<void> {
    // Connect to Redis for distributed service registry
    const Redis = await import("ioredis");
    this.redis = new Redis.default(this.options.redisUrl);
  }

  /**
   * Register a new service instance
   */
  async registerService(service: Omit<ServiceInstance, "registeredAt" | "lastHeartbeat" | "status">): Promise<void> {
    const instance: ServiceInstance = {
      ...service,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: "unknown",
    };

    this.services.set(service.id, instance);

    // Store in Redis for distributed discovery
    if (this.redis) {
      await this.redis.hset(
        `services:${service.type}`,
        service.id,
        JSON.stringify(instance)
      );
      await this.redis.publish("service:registered", JSON.stringify(instance));
    }

    // Start health check timer
    this.startHealthCheck(service.id);

    console.log(`[ServiceDiscovery] Registered ${service.name} (${service.id})`);
  }

  /**
   * Deregister a service instance
   */
  async deregisterService(serviceId: string, reason: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) return;

    // Clear timers
    this.clearTimers(serviceId);

    // Remove from local registry
    this.services.delete(serviceId);

    // Remove from Redis
    if (this.redis) {
      await this.redis.hdel(`services:${service.type}`, serviceId);
      await this.redis.publish(
        "service:deregistered",
        JSON.stringify({ serviceId, serviceName: service.name, reason })
      );
    }

    console.log(`[ServiceDiscovery] Deregistered ${service.name} (${serviceId}): ${reason}`);
  }

  /**
   * Update service heartbeat
   */
  async heartbeat(serviceId: string, metrics?: { cpu?: number; memory?: number; requestsPerSecond?: number; errorRate?: number }): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) return;

    service.lastHeartbeat = Date.now();
    
    if (metrics) {
      service.metadata = { ...service.metadata, ...metrics };
    }

    // Update in Redis
    if (this.redis) {
      await this.redis.hset(
        `services:${service.type}`,
        serviceId,
        JSON.stringify(service)
      );
    }
  }

  /**
   * Update service health status
   */
  async updateHealth(serviceId: string, health: ServiceHealth): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) return;

    service.status = health.status;

    // Update in Redis
    if (this.redis) {
      await this.redis.hset(
        `services:${service.type}`,
        serviceId,
        JSON.stringify(service)
      );
    }

    console.log(`[ServiceDiscovery] Health update for ${service.name}: ${health.status}`);
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceInstance | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all services of a specific type
   */
  getServicesByType(type: ServiceType): ServiceInstance[] {
    return Array.from(this.services.values()).filter(s => s.type === type);
  }

  /**
   * Get healthy services of a specific type
   */
  getHealthyServices(type: ServiceType): ServiceInstance[] {
    return this.getServicesByType(type).filter(
      s => s.status === "healthy" && this.isServiceAlive(s)
    );
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  /**
   * Check if service is alive based on last heartbeat
   */
  private isServiceAlive(service: ServiceInstance): boolean {
    return Date.now() - service.lastHeartbeat < this.options.serviceTimeout;
  }

  /**
   * Start health check for a service
   */
  private startHealthCheck(serviceId: string): void {
    const timer = setInterval(async () => {
      const service = this.services.get(serviceId);
      if (!service) {
        this.clearTimers(serviceId);
        return;
      }

      // Check if service is still alive
      if (!this.isServiceAlive(service)) {
        console.log(`[ServiceDiscovery] Service ${service.name} (${serviceId}) timed out`);
        await this.deregisterService(serviceId, "Heartbeat timeout");
        return;
      }

      // Perform health check
      try {
        const start = Date.now();
        const response = await fetch(service.healthCheckUrl, { 
          method: "GET",
          signal: AbortSignal.timeout(5000)
        });
        const responseTime = Date.now() - start;

        const health: ServiceHealth = {
          serviceId,
          serviceName: service.name,
          status: response.ok ? "healthy" : "unhealthy",
          checks: [{
            name: "http",
            status: response.ok ? "pass" : "fail",
            responseTime,
            message: response.ok ? undefined : `HTTP ${response.status}`,
          }],
          timestamp: Date.now(),
        };

        await this.updateHealth(serviceId, health);
      } catch (error) {
        const health: ServiceHealth = {
          serviceId,
          serviceName: service.name,
          status: "unhealthy",
          checks: [{
            name: "http",
            status: "fail",
            responseTime: -1,
            message: error instanceof Error ? error.message : "Unknown error",
          }],
          timestamp: Date.now(),
        };

        await this.updateHealth(serviceId, health);
      }
    }, this.options.healthCheckInterval);

    this.healthCheckTimers.set(serviceId, timer);
  }

  /**
   * Clear all timers for a service
   */
  private clearTimers(serviceId: string): void {
    const healthTimer = this.healthCheckTimers.get(serviceId);
    if (healthTimer) {
      clearInterval(healthTimer);
      this.healthCheckTimers.delete(serviceId);
    }

    const heartbeatTimer = this.heartbeatTimers.get(serviceId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(serviceId);
    }
  }

  /**
   * Shutdown the service discovery
   */
  async shutdown(): Promise<void> {
    // Clear all timers
    for (const serviceId of this.services.keys()) {
      this.clearTimers(serviceId);
    }

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    this.services.clear();
  }
}
