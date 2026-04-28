# Listing Shadow Update Issue

## Problem

When the cloud pushes a `lastRequestOn` update for a listing via the classic shadow delta, the listing data is **never** synced to the local DynamoDB table.

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

### Cause 1: Iterating desired keys instead of delta keys

```typescript
// listings.service.ts — processes ALL desired listings
const promises = Object.keys(desiredShadowListings).map(async (shadowName) => {
```

The classic shadow delta contained only `listing:1225618287786473681`, but `desiredShadowListings` contained two listings. Both were processed, including `listing:1225414147364900825` which had not changed.

This is inefficient but not the cause of the skip — both listings were still evaluated for update.

### Cause 2: Inverted comparison logic (the real bug)

```typescript
// listings.service.ts — skips when timestamps MATCH
if (classicShadowListing.lastRequestOn === delta.lastRequestOn) {
  return;
}
```

`delta` here is `getShadowResult.state.desired` from the **named shadow**.

The cloud pushes the **same** `lastRequestOn` to both the classic shadow desired state and the named shadow desired state simultaneously. By the time the device fetches the named shadow, its `desired.lastRequestOn` already equals the classic shadow's `lastRequestOn`. The `===` check is always true → the listing is always skipped.

**This is confirmed by the log**: the named shadow fetch produced no upsert — the comparison fired and returned early on every call.

Compare with the reservation pattern, which works correctly:

```typescript
// reservations.service.ts — skips when timestamps DIFFER
if (classicShadowReservation.lastRequestOn != delta.lastRequestOn) {
  return;
}
```

Reservations process when classic and named shadow timestamps **match**, which is exactly the condition that always holds (cloud sets both to the same value). Listings do the opposite — they process only when timestamps differ, which never happens.

---

## Shadow State

### Classic Shadow (desired)
Contains `action` + `lastRequestOn` for each listing. Updated by the cloud at the same time as the named shadow.

### Named Shadow — Listing (e.g. `listing:1225618287786473681`)
```json
{
  "state": {
    "desired": {
      "listingId": "1225618287786473681",
      "propertyCode": "WIP",
      "spaces": [{ "uuid": "adwJwZ", "assetName": "101", "category": "SPACE" }],
      "lastRequestOn": "2026-04-28T02:03:19.496Z"
    }
  }
}
```

The cloud sets `desired.lastRequestOn` here to the **same value** as in the classic shadow before the device receives the delta. There is no window where the named shadow has a stale timestamp.

---

## Fix

### Fix 1: Iterate delta keys only (align with reservation)

```typescript
// Before
const promises = Object.keys(desiredShadowListings).map(async (shadowName: string) => {
  const classicShadowListing: ClassicShadowListing = desiredShadowListings[shadowName];

// After
const promises = Object.keys(deltaShadowListings).map(async (shadowName: string) => {
  const classicShadowListing: ClassicShadowListing = desiredShadowListings[shadowName];
```

### Fix 2: Invert the comparison (align with reservation)

```typescript
// Before — skips when equal (always true → never processes)
if (classicShadowListing.lastRequestOn === delta.lastRequestOn) {
  return;
}

// After — skips when different (never true → always processes the changed listing)
if (classicShadowListing.lastRequestOn != delta.lastRequestOn) {
  return;
}
```

---

## Before / After Comparison

| Aspect | Reservation (works) | Listing (broken) | Listing (fixed) |
|--------|---------------------|------------------|-----------------|
| Iteration | `Object.keys(deltaShadow...)` — delta keys only | `Object.keys(desiredShadow...)` — ALL desired keys | `Object.keys(deltaShadow...)` — delta keys only |
| Skip condition | `classic != named` → skip | `classic === named` → skip | `classic != named` → skip |
| Result when cloud sets both to same TS | Processes ✅ | Skips ❌ | Processes ✅ |
