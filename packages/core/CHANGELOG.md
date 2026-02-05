# @pubsubjs/core

## 0.2.1

### Patch Changes

- 5893d56: Fix npm publishing to use proper semver ranges instead of workspace:\* protocol

## 0.2.0

### Minor Changes

- e32a69b: Add attribute-based event filtering at the transport level

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

## 0.1.2

### Patch Changes

- 10c33d0: Fix release workflow - remove prepublishOnly, mark examples as private

## 0.1.1

### Patch Changes

- 00be192: Improve README with documentation and quick start guide
