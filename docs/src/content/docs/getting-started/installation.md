---
title: Installation
description: How to install PubSubJS packages
---

PubSubJS is distributed as multiple packages. Install only what you need.

## Core Package

The core package is required for all PubSubJS applications:

```bash
# Using bun (recommended)
bun add @pubsubjs/core

# Using npm
npm install @pubsubjs/core

# Using yarn
yarn add @pubsubjs/core

# Using pnpm
pnpm add @pubsubjs/core
```

## Schema Validation

PubSubJS supports any [Standard Schema](https://github.com/standard-schema/standard-schema) compatible validation library. Install your preferred library:

```bash
# Zod (recommended)
bun add zod

# Valibot (smaller bundle size)
bun add valibot

# ArkType
bun add arktype
```

## Transport Packages

Install the transport(s) you need:

### WebSocket Transport

For real-time browser-server communication:

```bash
bun add @pubsubjs/transport-websocket
```

### Redis Transport

For distributed systems and microservices:

```bash
bun add @pubsubjs/transport-redis
```

### SSE Transport

For server-to-client streaming:

```bash
bun add @pubsubjs/transport-sse
```

## React Integration

For React applications:

```bash
bun add @pubsubjs/react
```

## Peer Dependencies

Some packages have peer dependencies:

| Package | Peer Dependencies |
|---------|-------------------|
| `@pubsubjs/core` | `zod` or `valibot` (optional) |
| `@pubsubjs/react` | `react ^18.0.0 \|\| ^19.0.0` |

## TypeScript Configuration

PubSubJS is written in TypeScript and ships with type definitions. For the best experience, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "esModuleInterop": true
  }
}
```

## Verifying Installation

Create a simple test file to verify your installation:

```typescript
// test.ts
import { defineEvent } from "@pubsubjs/core";
import { z } from "zod";

const events = defineEvent([
  {
    name: "test.event",
    schema: z.object({ message: z.string() }),
  },
]);

console.log("PubSubJS installed successfully!");
console.log("Events:", Object.keys(events));
```

Run it:

```bash
bun test.ts
# or
npx ts-node test.ts
```

## Next Steps

- [Quick Start](/getting-started/quick-start/) - Build your first application
- [Events & Schemas](/concepts/events/) - Learn about event definitions
