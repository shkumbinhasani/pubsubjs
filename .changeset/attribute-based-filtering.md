---
"@pubsubjs/core": minor
"@pubsubjs/transport-websocket": minor
"@pubsubjs/transport-redis": minor
"@pubsubjs/transport-sse": minor
---

Add attribute-based event filtering at the transport level

- Add `FilterPolicy` type with operators: `$in`, `$exists`, `$prefix`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$between`
- Add `EventAttributes` type for attaching filterable attributes to events
- Add `matchesFilter()` function for evaluating filter policies
- Add `toSNSFilterPolicy()` for AWS SNS compatibility
- Update `PublishOptions` to accept `attributes`
- Update `Subscriber.on()` to accept filter option
- Implement client-side filtering in WebSocket, Redis, and SSE transports
- Support nested attributes via dot notation (e.g., `"user.role"`)

Filter semantics:
- Multiple conditions on same key = OR (at least one must match)
- Multiple keys = AND (all must match)
