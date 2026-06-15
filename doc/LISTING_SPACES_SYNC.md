# Listing Spaces Sync (Edge)

## Overview

The TS edge component syncs listing shadow deltas to local DynamoDB (`TBL_LISTING`). This ensures the edge has the current `spaces` for each listing, independent of stale reservation data.

## Problem Statement

When a listing's `spaces` are updated (assets added, renamed, or removed):
- Existing `ReservationItem` records retain **stale `spaces` data** (copied at create/renew time)
- Edge components need current `spaces` for member authorization and group validation

## Solution

Sync listing shadows to local DDB at the edge. The Python side reads `spaces` from `TBL_LISTING`, not from `TBL_RESERVATION`.

---

## Data Flow

```
Cloud (Listing Update)
    │
    ▼
IoT Shadow Delta (listing:<listingId>)
    │
    ▼
listings.service.processListingsShadow()
    │
    ▼
listings.dao.upsertListingSpaces() → TBL_LISTING (hostId, listingId, spaces, lastUpdateOn)
    │
    ▼
Python fetch_members() reads TBL_LISTING.spaces
```

---

## Components

### 1. `listings.service.ts`

**Purpose**: Process listing shadow deltas and sync to local DDB.

**Key Methods**:

```typescript
// Process shadow deltas for all listings
processListingsShadow(
  deltaShadowListings: ClassicShadowListings,
  desiredShadowListings: ClassicShadowListings
): Promise<void>

// Handle listing update
processShadowDelta(classicShadowListing: ClassicShadowListing, shadowName: string): Promise<void>

// Handle listing removal
processShadowDeleted(classicShadowListing: ClassicShadowListing, shadowName: string): Promise<void>
```

**Flow for Update**:
1. Receive shadow delta for `listing:<listingId>`
2. Fetch full desired state from IoT shadow
3. Call `listingsDao.upsertListingSpaces()` with:
   - `hostId`
   - `listingId`
   - `spaces` (from shadow)
   - `lastUpdateOn` (from shadow)
4. Publish `listing_deployed` IoT message

**Flow for Removal**:
1. Receive shadow removal for `listing:<listingId>`
2. Call `listingsDao.deleteListingSpaces(hostId, listingId)`
3. Publish `listing_reset` IoT message

---

### 2. `listings.dao.ts`

**Purpose**: Local DDB operations for listing spaces.

**Table Schema**:
```
TBL_LISTING
├── PK: hostId
├── SK: listingId
├── spaces: Space[]
└── lastUpdateOn: string
```

**Key Methods**:

```typescript
// Store/update listing spaces
upsertListingSpaces(data: ListingSpaces): Promise<void>

// Delete listing spaces
deleteListingSpaces(hostId: string, listingId: string): Promise<void>

// Fetch spaces for a listing
getListingSpaces(hostId: string, listingId: string): Promise<Space[]>
```

---

### 3. Shadow Name Format

Listing shadows use **named shadows** with the format:
```
listing:<listingId>
```

Example: `listing:1225414147364900825`

This allows multiple listings to be tracked on the same edge device.

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| `listings.service.processListingsShadow()` | ✅ Implemented | Receives shadow deltas |
| `listings.service.processShadowDelta()` | ✅ Implemented | Upserts to local DDB |
| `listings.service.processShadowDeleted()` | ✅ Implemented | Deletes from local DDB |
| `listings.dao.upsertListingSpaces()` | ✅ Implemented | Stores spaces in TBL_LISTING |
| `listings.dao.deleteListingSpaces()` | ✅ Implemented | Deletes by hostId/listingId |
| `listings.dao.getListingSpaces()` | ✅ Implemented | Fetches spaces by listingId |

---

## Related Docs

- **Python Edge**: `gocheckin/doc/design/LISTING_SPACES_EDGE_SYNC.md` - How Python reads spaces
- **Cloud**: `gocheckin/doc/design/cloud/REMOVE_SPACES_FROM_RESERVATION.md` - Cloud-side design
- **Cloud**: `gocheckin/doc/design/cloud/SPACES_THROUGH_SHADOW_EDGE_REQUIREMENTS.md` - Shadow requirements
