# Reservation Refresh (Edge)

## Problem

When a listing's `spaces` change (assets added/removed):
1. **`TBL_RESERVATION.spaces` becomes stale** - copied at reservation create/renew time
2. **Python reads `spaces` from `TBL_RESERVATION`** - uses stale data for lock authorization
3. **TS `reservations.service.ts` does NOT use `spaces`** - only syncs members to local DDB

This causes **member authorization failures** when listing `spaces` have changed.

**Key Finding**: The TS edge component (`reservations.service.ts`) does NOT need changes. The fix is **Python-only** - update `py_handler.py:fetch_members()` to read `spaces` from `TBL_LISTING` instead of `TBL_RESERVATION`.

---

## Current Flow

```
Cloud Shadow UPDATE (reservation:<code>)
    │
    ▼
reservations.service.processShadowDelta()
    │
    ▼
reservations.service.refreshReservation(delta)
    │
    ├── deleteMembers() → local DDB
    ├── updateMembers() → local DDB
    ├── updateReservation() → local DDB
    └── call /recognise → Python (triggers fetch_members)
        │
        ▼
    Python: fetch_members()
        │
        ├── get_active_reservations() → TBL_RESERVATION (includes stale spaces) ❌
        ├── get_members_for_reservations() → stamps members with authorizedSpaces
        └── Members loaded with STALE spaces for lock authorization
```

**Gap**: `fetch_members()` in Python reads `spaces` from `TBL_RESERVATION` (stale) instead of `TBL_LISTING` (current).

---

## Required Fix (Python Only)

### Update `py_handler.py`

The fix is entirely in the Python edge component. No changes are needed in `reservations.service.ts`.

**Step 1**: Add a helper to fetch current spaces from `TBL_LISTING`:

```python
def get_listing_spaces(host_id: str, listing_id: str) -> List[dict]:
    """Fetch current spaces for a listing from TBL_LISTING."""
    table = dynamodb.Table(os.environ['TBL_LISTING'])
    response = table.get_item(Key={'hostId': host_id, 'listingId': listing_id})
    return response.get('Item', {}).get('spaces', [])
```

**Step 2**: Update `get_members_for_reservations()` (around line 1000) to use `TBL_LISTING`:

```python
# OLD (reads STALE spaces from reservation):
authorized_spaces = {s['uuid'] for s in reservation.get('spaces', [])}

# NEW (fetch current spaces from TBL_LISTING):
for reservation in reservations:
    listing_id = reservation['listingId']
    listing_spaces = get_listing_spaces(os.environ['AWS_IOT_HOST_ID'], listing_id)
    authorized_spaces = {s['uuid'] for s in listing_spaces}
    # ... stamp members with authorized_spaces ...
```

**Step 3**: Update `get_active_members()` similarly if it also stamps `authorizedSpaces`.

**Step 4** (optional): Remove `#spaces` from `ProjectionExpression` in `get_active_reservations()` and `get_staff_reservations()` since spaces are no longer read from `TBL_RESERVATION`.

---

## What Does NOT Need Changes

### TS Edge (`reservations.service.ts`)

**No changes needed**. The `reservations.service.ts` file:
- Does NOT use `spaces` anywhere
- Only syncs members to local DDB
- Does NOT pass `spaces` to Python

### Cloud Side

**Cloud can continue storing `spaces` in reservations** (for backward compatibility), but the **edge Python should ignore it** and read from `TBL_LISTING` instead.

---

## Implementation Checklist

- [ ] **Python**: Add `get_listing_spaces()` function to read from `TBL_LISTING`
- [ ] **Python**: Update `get_members_for_reservations()` to call `get_listing_spaces()` (around line 1000)
- [ ] **Python**: Update `get_active_members()` to call `get_listing_spaces()` if it stamps `authorizedSpaces`
- [ ] **Python**: Remove `#spaces` from `ProjectionExpression` in `get_active_reservations()` and `get_staff_reservations()`
- [ ] **Python**: Add `TBL_LISTING` environment variable to `function.conf`
- [ ] **TS**: Confirm `reservations.service.ts` requires no changes
- [ ] **Test**: Update listing spaces → verify Python sees current spaces within 1 second
- [ ] **Test**: Face recognition with member → verify lock authorization uses current spaces

---

## Related Docs

- **TS Listing Sync**: `LISTING_SPACES_SYNC.md` - How TS syncs listing shadows to TBL_LISTING
- **Python Edge**: `../ggp-func-py-gocheckin/doc/design/LISTING_SPACES_EDGE_SYNC.md` - Python fix details
- **Python Overview**: `../ggp-func-py-gocheckin/doc/design/LISTING_SPACES_OVERVIEW.md` - Cross-component overview
- **Cloud**: `../ggp-func-py-gocheckin/doc/design/cloud/REMOVE_SPACES_FROM_RESERVATION.md` - Cloud-side design (reference)
