# Listing Spaces Sync - Implementation Overview (TS Edge)

This document provides a quick reference for the listing spaces sync implementation in the TS edge component.

---

## Problem

When a listing's `spaces` change (assets added/removed), existing reservation records retain **stale `spaces` data** (copied at create/renew time). The TS edge component needs to:
1. Sync listing shadows to local DDB
2. Provide current `spaces` when refreshing reservations

---

## Solution

**Listing Shadow Pattern**:
1. Cloud generates listing shadow delta (`listing:<listingId>`)
2. TS edge receives delta, fetches full shadow, stores in local DDB (`TBL_LISTING`)
3. Python edge reads `spaces` from `TBL_LISTING` at runtime

---

## Component Map

| Component | File | Status | Doc |
|-----------|------|--------|-----|
| **Listing Shadow Sync** | `listings.service.ts` | ✅ Implemented | [`LISTING_SPACES_SYNC.md`](LISTING_SPACES_SYNC.md) |
| **Local DDB Access** | `listings.dao.ts` | ✅ Implemented | See below |

**Note**: TS `reservations.service.ts` does NOT need changes. It only syncs members to local DDB and does NOT use `spaces`. The `spaces` lookup happens on the **Python side** during member fetch.

---

## Quick Links

### TS Edge Docs

| Doc | Purpose |
|-----|---------|
| [`LISTING_SPACES_SYNC.md`](LISTING_SPACES_SYNC.md) | How listing shadows sync to local DDB |
| [`RESERVATION_REFRESH.md`](RESERVATION_REFRESH.md) | How reservation refresh should fetch spaces |

### Python Edge Docs

| Doc | Purpose |
|-----|---------|
| `../ggp-func-py-gocheckin/doc/design/LISTING_SPACES_EDGE_SYNC.md` | How Python fetches spaces from local DDB |

### Cloud Reference

| Doc | Purpose |
|-----|---------|
| `../ggp-func-py-gocheckin/doc/design/cloud/REMOVE_SPACES_FROM_RESERVATION.md` | Cloud-side design |
| `../ggp-func-py-gocheckin/doc/design/cloud/SPACES_THROUGH_SHADOW_EDGE_REQUIREMENTS.md` | Shadow payload requirements |

---

## Implementation Status

### ✅ Implemented: Listing Shadow Sync

**File**: `listings.service.ts`

```typescript
// Process listing shadow deltas
async processListingsShadow(
  deltaShadowListings: ClassicShadowListings,
  desiredShadowListings: ClassicShadowListings
): Promise<void>

// Handle listing update
async processShadowDelta(classicShadowListing: ClassicShadowListing, shadowName: string): Promise<void> {
  // Fetch full shadow state
  const getShadowResult = await this.iotService.getShadow({
    thingName: AWS_IOT_THING_NAME,
    shadowName: shadowName  // e.g., "listing:12345"
  });

  const delta = getShadowResult.state.desired;

  // Store in local DDB
  await this.listingsDao.upsertListingSpaces({
    hostId: process.env.HOST_ID,
    listingId: delta.listingId,
    spaces: delta.spaces,
    lastUpdateOn: delta.lastRequestOn
  });
}
```

**File**: `listings.dao.ts`

```typescript
// Store/update listing spaces
async upsertListingSpaces(data: ListingSpaces): Promise<void>

// Fetch spaces for a listing
async getListingSpaces(hostId: string, listingId: string): Promise<Space[]>
```

### ✅ No Gap: Reservation Refresh

**File**: `reservations.service.ts`

**Current Code** (`refreshReservation()`):
```typescript
private async refreshReservation(delta: NamedShadowReservation): Promise<any> {
  // Delete local DDB members
  await this.reservationsDao.deleteMembers(...);

  // Update local DDB members
  await this.reservationsDao.updateMembers(...);

  // Update local DDB reservation
  await this.reservationsDao.updateReservation(delta.reservation);

  // Call Python /recognise
  const responsesEmbedding = await Promise.all(
    Object.values(delta.members).map(member =>
      axios.post("http://localhost:7777/recognise", member)
    )
  );

  // Force Python to re-fetch members
  await axios.post("http://localhost:7777/recognise", {});
}
```

**No changes needed**. `reservations.service.ts` does not use `spaces`. The `spaces` lookup happens on the **Python side** in `py_handler.py:fetch_members()`. See [`RESERVATION_REFRESH.md`](RESERVATION_REFRESH.md) for the Python-only fix.

---

## Testing Checklist

- [ ] **Listing Update**: Update listing spaces → verify `TBL_LISTING` updated within 1 second
- [ ] **Reservation Refresh**: Renew reservation → verify Python receives current `spaces`
- [ ] **Edge Case**: Missing listing in `TBL_LISTING` → graceful fallback (log warning)

---

## Related Docs

- **Python Edge**: `../ggp-func-py-gocheckin/doc/design/LISTING_SPACES_EDGE_SYNC.md` - How Python fetches spaces
- **Python Overview**: `../ggp-func-py-gocheckin/doc/design/LISTING_SPACES_OVERVIEW.md` - Cross-component overview
