# Use the official Bun image
FROM oven/bun:1

WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock ./
COPY packages/core/package.json ./packages/core/
COPY packages/transport-redis/package.json ./packages/transport-redis/

# Install dependencies
RUN bun install

# Copy source code
COPY packages/core ./packages/core
COPY packages/transport-redis ./packages/transport-redis
COPY examples/microservices-redis ./examples/microservices-redis

# Build packages
RUN bun run build --filter=@pubsub/core --filter=@pubsub/transport-redis

# Expose health check port
EXPOSE 3000-4000

# Default command (can be overridden)
CMD ["bun", "run", "examples/microservices-redis/api-gateway.ts"]
