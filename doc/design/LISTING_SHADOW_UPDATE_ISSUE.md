# Listing Shadow Update Issue

## Problem

When the cloud pushes a `lastRequestOn` update for a listing via the classic shadow delta, the listing data is **never** synced to the local DynamoDB table. The root cause spans both cloud side and edge side: listings and reservations follow different patterns end-to-end, and the listing pattern is broken.

## Observed Behavior (from log)

Cloud pushes an update for `listing:1225618287786473681` with a new `lastRequestOn`:

```
classic shadow event delta: {
  "state": {
    "listings": {
      "listing:1225618287786473681": {"lastRequestOn": "2026-04-28T02:03:19.496Z"}
    }
  }
}
```

`processListingsShadow` is called. Two named shadow fetches run. No `listings.dao upsertListingSpaces` log appears. Both listings are silently skipped:

```
listings.service processListingsShadow results: [
  {"status":"fulfilled","value":{"shadowName":"listing:1225618287786473681","action":"UPDATE"}},
  {"status":"fulfilled","value":{"shadowName":"listing:1225414147364900825","action":"UPDATE"}}
]
```

The listing data in DynamoDB is never updated.

---

## Root Causes

### Cause 1: Edge side iterates desired keys instead of delta keys

```typescript
// listings.service.ts — processes ALL desired listings on every delta
const promises = Object.keys(desiredShadowListings).map(async (shadowName) => {
```

The classic shadow delta contained only `listing:1225618287786473681`, but `desiredShadowListings` contained two listings. Both were processed unnecessarily.

### Cause 2: Edge side comparison logic is inverted (the real bug)

```typescript
// listings.service.ts — skips when timestamps MATCH
if (classicShadowListing.lastRequestOn === delta.lastRequestOn) {
  return;
}
```

`delta` is `getShadowResult.state.desired` from the **named shadow**. The cloud sets the same `lastRequestOn` on both the classic shadow and the named shadow simultaneously. So this check is always true → the listing is always skipped.

**Confirmed by the log**: no `upsertListingSpaces` call ever appears — the comparison fires and returns early on every invocation.

The reservation edge code uses the opposite check and works correctly:

```typescript
// reservations.service.ts — skips when timestamps DIFFER
if (classicShadowReservation.lastRequestOn != delta.lastRequestOn) {
  return;
}
```

### Cause 3: Cloud side listing logic is not aligned with reservation logic

The cloud side has separate implementations for listing shadow updates and reservation shadow updates. These are not written to the same pattern. Fixing only the edge side in isolation would leave the two flows inconsistent and make future maintenance harder.

---

## Solution: End-to-End Alignment

The reservation flow works correctly today. Both listings and reservations should follow an identical end-to-end pattern. The fix must be coordinated across cloud side and edge side together.

### The canonical pattern (from reservations, which works)

```
Cloud side:
  1. Update named shadow desired  → full data + lastRequestOn = "T"
  2. Update classic shadow desired → lastRequestOn = "T"  (same value)

Edge side (on classic shadow delta received):
  3. Iterate delta keys only
  4. For each key: fetch named shadow desired
  5. Skip if classic lastRequestOn != named lastRequestOn  (i.e. process if equal)
  6. Upsert to DynamoDB
  7. Update named shadow reported
```

### Cloud side change (listing → align with reservation)

Refactor the cloud listing shadow update logic to follow the same structure as the reservation shadow update:
- Ensure the named shadow desired state is updated with the full listing data and `lastRequestOn` before (or atomically with) the classic shadow update
- The `lastRequestOn` written to the classic shadow must match the one written to the named shadow

### Edge side change (listing → align with reservation)

Two changes in `listings.service.ts`:

**1. Iterate delta keys only**
```typescript
// Before
const promises = Object.keys(desiredShadowListings).map(async (shadowName: string) => {
  const classicShadowListing: ClassicShadowListing = desiredShadowListings[shadowName];

// After
const promises = Object.keys(deltaShadowListings).map(async (shadowName: string) => {
  const classicShadowListing: ClassicShadowListing = desiredShadowListings[shadowName];
```

**2. Invert the comparison**
```typescript
// Before — skips when equal → always skips → never processes
if (classicShadowListing.lastRequestOn === delta.lastRequestOn) {
  return;
}

// After — skips when different → processes when cloud has set both to same value
if (classicShadowListing.lastRequestOn != delta.lastRequestOn) {
  return;
}
```

---

## End State: Listings and Reservations Fully Aligned

| Aspect | Reservations | Listings (after fix) |
|--------|-------------|----------------------|
| Cloud: named shadow desired | Set with full data + `lastRequestOn` | Set with full data + `lastRequestOn` |
| Cloud: classic shadow desired | `lastRequestOn` = same value | `lastRequestOn` = same value |
| Edge: iteration | `Object.keys(deltaShadow...)` | `Object.keys(deltaShadow...)` |
| Edge: skip condition | `classic != named` → skip | `classic != named` → skip |
| Edge: process condition | `classic == named` → process | `classic == named` → process |
