# LOCK_BUTTON Companion Association — Backend & Frontend Design

## Overview

This document describes the cloud-side changes required to support associating LOCK_BUTTON devices (e.g., GreenPower_2) with parent LOCK devices (e.g., MAG001AC). This enables button-triggered face detection for locks without built-in occupancy sensors.

**Related Edge Documentation**: [../edge/LOCK_BUTTON_ASSOCIATION.md](../edge/LOCK_BUTTON_ASSOCIATION.md)

---

## Problem Statement

MAG001AC magnetic locks have no occupancy sensor. The edge device needs companion LOCK_BUTTONs to trigger actions. There are **two types** of companion buttons:

| Button Type | Location | Behavior on Press |
|-------------|----------|-------------------|
| **Entry Button** | Outside / Entry side | Triggers face detection → Face match → Unlock |
| **Exit Button** | Inside / Behind door | Unlocks immediately (no detection) |

The cloud must:

1. Allow users to associate LOCK_BUTTONs with a parent LOCK
2. Distinguish between **entry** and **exit** button types
3. Persist `companionOf` and `buttonType` on LOCK_BUTTON records
4. Sync these fields to edge via LOCK_BUTTON named shadow

---

## Key Architecture: Association Lives on LOCK_BUTTON

The LOCK_BUTTON record is the **sole owner** of association data (`companionOf`, `buttonType`):

1. **The click event arrives on the LOCK_BUTTON** — lookup starts there, so having the parent lock reference avoids scanning other records
2. **A camera is not mandatory** — an EXIT button only needs to unlock a lock, no camera involved
3. **Clean lookup chain** — LOCK_BUTTON → `companionOf` → LOCK → `lock.cameras` → trigger detection

The cloud persists `companionOf`/`buttonType` on the LOCK_BUTTON DynamoDB record and syncs them to edge via a LOCK_BUTTON named IoT shadow. No `entryButtons`/`exitButtons` arrays are needed on the camera or lock.

### DynamoDB Records per Asset Type

**LOCK_BUTTON** — placed asset with association data:

```json
{
  "hostId": "rulin",
  "uuid": "0x00_greenpower_button_1",
  "hostPropertyCode": "rulin-prop01",
  "coreName": "neoseed_Core",
  "category": "LOCK_BUTTON",
  "assetName": "DoorButton1",
  "layoutId": 0,
  "position": { "x": 150, "y": 300 },
  "inSpaces": ["space-entrance-right"],
  "companionOf": "0xe4b323fffeb4b614",
  "buttonType": "ENTRY",
  "lastUpdateOn": "2026-02-20T..."
}
```

`companionOf` is the UUID of the parent LOCK/KEYPAD_LOCK. `buttonType` is `'ENTRY'` or `'EXIT'`. These fields are set by the frontend at save time and persisted in DynamoDB. They are also synced to a LOCK_BUTTON named IoT shadow (see below).

**LOCK** — basic placed asset, **no association data**:

```json
{
  "hostId": "rulin",
  "uuid": "0xe4b323fffeb4b614",
  "hostPropertyCode": "rulin-prop01",
  "coreName": "neoseed_Core",
  "category": "LOCK",
  "assetName": "MAG002",
  "layoutId": 0,
  "position": { "x": 200, "y": 350 },
  "inSpaces": ["space-entrance-right"],
  "lastUpdateOn": "2026-02-20T..."
}
```

No association data. The lock is passive — it gets unlocked. It never needs to know which buttons are associated with it. The edge resolves button-to-lock association via the LOCK_BUTTON's `companionOf` field.

**CAMERA** — carries the `locks` map with lock names only:

```json
{
  "hostId": "rulin",
  "uuid": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
  "hostPropertyCode": "rulin-prop01",
  "coreName": "neoseed_Core",
  "category": "CAMERA",
  "assetName": "Dahua",
  "layoutId": 0,
  "position": { "x": 180, "y": 280 },
  "inSpaces": ["space-entrance-right"],
  "locks": {
    "0xe4b323fffeb4b614": {
      "assetName": "MAG002"
    }
  },
  "lastUpdateOn": "2026-02-20T..."
}
```

The camera `locks` map only carries `assetName` per lock. No `entryButtons`/`exitButtons` — button-to-lock association is on the LOCK_BUTTON record, not the camera.

### Camera IoT Device Shadow

The camera's named shadow mirrors the `locks` map from DynamoDB — only `assetName` per lock:

```json
{
  "state": {
    "desired": {
      "layoutId": 0,
      "position": { "x": 180, "y": 280 },
      "inSpaces": ["space-entrance-right"],
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002"
        }
      }
    }
  }
}
```

### LOCK IoT Named Shadow

Each placed LOCK gets its own named shadow (thingName=coreName, shadowName=lock UUID) to sync cloud-managed fields to the edge. Without this, the edge has no mechanism to receive space assignment:

```json
{
  "state": {
    "desired": {
      "roomCode": "space-entrance-right"
    }
  }
}
```

`roomCode` is derived from the LOCK's `inSpaces[0]`. Lock-camera association is carried by the camera shadow's `locks` map; the edge builds the reverse `lock.cameras` map locally via `syncLockCameraReference()`.

The classic (main) thing shadow is also updated with `desired.locks[uuid] = { action: 'UPDATE'|'REMOVE', lastRequestOn }` so the edge shadow program knows which LOCK named shadows changed.

### LOCK_BUTTON IoT Named Shadow

Each placed LOCK_BUTTON gets its own named shadow (thingName=coreName, shadowName=button UUID) with association data:

```json
{
  "state": {
    "desired": {
      "companionOf": "0xe4b323fffeb4b614",
      "buttonType": "ENTRY"
    }
  }
}
```

When a LOCK_BUTTON is made available (removed from layout), the shadow fields are set to `null`.

The classic (main) thing shadow is also updated with `desired.lockButtons[uuid] = { action: 'UPDATE'|'REMOVE', lastRequestOn }` so the edge shadow program knows which LOCK_BUTTON named shadows changed.

### Classic (Main) Thing Shadow — Notification Entries

The classic thing shadow carries `action`/`lastRequestOn` entries for cameras, spaces, locks, and lock buttons. The edge shadow program watches the classic shadow to discover which named shadows have changed:

```json
{
  "state": {
    "desired": {
      "cameras": {
        "ea9a49f2-c236-4d6d-b82f-a0725a03f614": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      },
      "spaces": {
        "space-entrance-right": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      },
      "locks": {
        "0xe4b323fffeb4b614": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      },
      "lockButtons": {
        "0x00_greenpower_button_1": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." },
        "0x00_greenpower_button_2": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      }
    }
  }
}
```

When an asset is removed from layout (made available), its entry is set to `{ action: 'REMOVE', lastRequestOn }`.

### Summary Table

| Record | Has association data? | What it stores |
|--------|----------------------|----------------|
| **LOCK_BUTTON (DynamoDB)** | **Yes** | `companionOf`, `buttonType`, position, inSpaces |
| **LOCK_BUTTON (IoT shadow)** | **Yes** | `companionOf`, `buttonType` — synced to edge |
| LOCK (DynamoDB) | No | position, inSpaces, category only |
| LOCK (IoT shadow) | No | `roomCode` (from `inSpaces[0]`) — space assignment synced to edge |
| CAMERA (DynamoDB) | No | `locks` map with `assetName` only — no button references |
| CAMERA (IoT shadow) | No | Same `locks` map — no button references |

---

## Prior State (Before Implementation)

> These sections document the state **before** the implementation was completed. They are kept for historical reference.

### Camera Shadow Lock Entry (Before — unchanged)

```json
{
  "state": {
    "desired": {
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002"
        }
      }
    }
  }
}
```

### Asset Model (Before)

```typescript
// assets.models.ts
export interface Asset {
    // ...
    locks?: string[];  // BUG: typed as string[] but used as Record<string, object>
}
```

### GraphQL Schema (Before)

```graphql
input AssetInput {
    locks: AWSJSON  # Flexible, can accept any JSON
}

type Asset {
    # ... no locks field — locks not returned to frontend
}
```

---

## Implemented State

### Camera Shadow Lock Entry (Unchanged)

The camera shadow lock entry carries only `assetName`. No `entryButtons`/`exitButtons` needed — button-to-lock association is on the LOCK_BUTTON record.

### LOCK_BUTTON Record (New Fields)

```json
{
  "companionOf": "0xe4b323fffeb4b614",
  "buttonType": "ENTRY"
}
```

These fields on the LOCK_BUTTON record (and its named shadow) are the sole mechanism for button-to-lock association.

---

## Data Model Changes

### New Interface: CameraLockEntry

```typescript
// assets.models.ts

export interface CameraLockEntry {
    assetName: string;
}

export interface CameraLocks {
    [lockUuid: string]: CameraLockEntry;
}
```

### Updated Interface: Asset

```typescript
// assets.models.ts
export interface Asset {
    hostId: string;
    uuid: string;
    propertyCode?: string;
    hostPropertyCode?: string;
    coreName?: string;
    category?: string;
    assetId?: string;
    assetName?: string;
    layoutId?: number;
    position?: Coordinates;
    inSpaces?: string[];
    locks?: CameraLocks;       // Fixed from string[] to CameraLocks
    companionOf?: string;      // assetId of parent lock (LOCK_BUTTON only)
    buttonType?: string;       // 'ENTRY' | 'EXIT' (LOCK_BUTTON only)
    lastUpdateOn?: string;
}
```

---

## GraphQL Schema Changes

### Add fields to Asset type and input

```graphql
type Asset @aws_iam @aws_cognito_user_pools {
    # ... existing fields ...
    locks: AWSJSON
    companionOf: String
    buttonType: String
    lastUpdateOn: AWSDateTime
}

input AssetInput {
    # ... existing fields ...
    locks: AWSJSON
    companionOf: String
    buttonType: String
    lastUpdateOn: AWSDateTime
}
```

`locks` enables round-trip of camera-lock co-location. `companionOf`/`buttonType` enable round-trip of LOCK_BUTTON association.

---

## Data Flow

### Save Flow (Frontend → Backend → Shadow)

```
Frontend Layout Editor
│  User places LOCK_BUTTON on canvas → assigns to same space as LOCK
│  User sets button type (Entry/Exit) via inline toggle
│  State: lockButtonTypes[buttonUuid] = 'ENTRY' | 'EXIT'
│
▼ saveLayout() in host.js
│  For each CAMERA asset:
│    1. Find co-located LOCKs (same inSpaces)
│    2. Build: camera.locks = { [lockUuid]: { assetName } }
│  For each LOCK_BUTTON asset:
│    1. Find co-located LOCK (same inSpaces)
│    2. Set: button.companionOf = lock.uuid
│    3. Set: button.buttonType = lockButtonTypes[button.uuid] || 'ENTRY'
│
▼ appsync.refreshLayout({ placedAssets }) → GraphQL mutation
│
▼ AssetsService.refreshLayout(...)
│  ├─ assetsDao.handleAssets()               → DynamoDB (stores companionOf/buttonType on LOCK_BUTTON, locks on CAMERA)
│  ├─ updatePlacedCameraShadow()             → IoT named shadow (camera locks map) + classic shadow (cameras[uuid])
│  ├─ updatePlacedLockShadow()               → IoT named shadow (LOCK roomCode) + classic shadow (locks[uuid])
│  └─ updatePlacedLockButtonShadow()         → IoT named shadow (companionOf/buttonType) + classic shadow (lockButtons[uuid])
│
▼ Edge receives shadow deltas
```

### Load Flow (Backend → Frontend)

```
Layout.vue mounted → loadAssets action
│
▼ getPlacedAssets GraphQL query (includes locks, companionOf, buttonType)
│
▼ host.js loadAssets action
│  For each LOCK_BUTTON with buttonType:
│    Populate lockButtonTypes[button.uuid] = button.buttonType
│
▼ UI restores Entry/Exit toggle state on each LOCK_BUTTON
```

### Shadow Processing Detail

All three shadow methods follow the same dual-write pattern: update the **named shadow** (asset-specific data) and update the **classic shadow** (`action`/`lastRequestOn` entry so the edge knows what changed).

```
updatePlacedCameraShadow:
  For each placed CAMERA:
    1. getShadow(coreName, uuid) — read existing named shadow
    2. Merge/diff new locks vs old shadow locks
    3. updateDesiredShadow(updatedShadow, coreName, uuid) — named shadow
    4. updateFullShadow({ desired.cameras[uuid]: { action, lastRequestOn } }, coreName) — classic shadow

updatePlacedLockShadow:
  1. getShadow(coreName) — read classic shadow once
  2. For each placed LOCK/KEYPAD_LOCK:
     - updateDesiredShadow({ roomCode }, coreName, uuid) — named shadow
     - Set desired.locks[uuid] = { action: 'UPDATE', lastRequestOn }
  3. For each available LOCK/KEYPAD_LOCK:
     - updateDesiredShadow({ roomCode: null }, coreName, uuid) — named shadow
     - Set desired.locks[uuid] = { action: 'REMOVE', lastRequestOn }
  4. updateFullShadow({ desired.locks }, coreName) — classic shadow (one write)

updatePlacedLockButtonShadow:
  1. getShadow(coreName) — read classic shadow once
  2. For each placed LOCK_BUTTON/KEYPAD:
     - updateDesiredShadow({ companionOf, buttonType }, coreName, uuid) — named shadow
     - Set desired.lockButtons[uuid] = { action: 'UPDATE', lastRequestOn }
  3. For each available LOCK_BUTTON/KEYPAD:
     - updateDesiredShadow({ companionOf: null, buttonType: null }, coreName, uuid) — named shadow
     - Set desired.lockButtons[uuid] = { action: 'REMOVE', lastRequestOn }
  4. updateFullShadow({ desired.lockButtons }, coreName) — classic shadow (one write)
```

---

## Backend Implementation

### 1. Update Asset Model

**File**: `src/functions/assets/assets.models.ts`

```typescript
export interface CameraLockEntry {
    assetName: string;
}

export interface CameraLocks {
    [lockUuid: string]: CameraLockEntry;
}

export interface Asset {
    // ... existing fields ...
    locks?: CameraLocks;       // Fixed type
    companionOf?: string;      // assetId of parent lock (LOCK_BUTTON only)
    buttonType?: string;       // 'ENTRY' | 'EXIT' (LOCK_BUTTON only)
}
```

### 2. Update GraphQL Schema

**File**: `schema.graphql`

Add `locks`, `companionOf`, `buttonType` to `type Asset` and `input AssetInput`.

### 3. DynamoDB DAO — Persist and Remove Fields

**File**: `src/functions/assets/assets.dao.ts`

In `handleAssets()`:
- **Available assets**: Added `companionOf, buttonType` to the REMOVE expression
- **Placed assets**: Conditionally SET `companionOf` and `buttonType` if present on the asset (same pattern as `locks`)

### 4. Service — LOCK_BUTTON Named Shadow + Classic Shadow

**File**: `src/functions/assets/assets.service.ts`

New method `updatePlacedLockButtonShadow(placedAssets, availableAssets)`:
- Reads the classic shadow once, then for each LOCK_BUTTON/KEYPAD:
  - **Placed**: updates named shadow with `{ companionOf, buttonType }`; sets `desired.lockButtons[uuid] = { action: 'UPDATE', lastRequestOn }`
  - **Available**: updates named shadow with `{ companionOf: null, buttonType: null }`; sets `desired.lockButtons[uuid] = { action: 'REMOVE', lastRequestOn }`
- Writes the classic shadow once at the end
- Called from `refreshLayout()` after `updatePlacedLockShadow()`

### 5. LOCK Named Shadow + Classic Shadow

**File**: `src/functions/assets/assets.service.ts`

New method `updatePlacedLockShadow(placedAssets, availableAssets)`:
- Reads the classic shadow once, then for each LOCK/KEYPAD_LOCK:
  - **Placed**: updates named shadow with `{ roomCode: lock.inSpaces[0] }`; sets `desired.locks[uuid] = { action: 'UPDATE', lastRequestOn }`
  - **Available**: updates named shadow with `{ roomCode: null }`; sets `desired.locks[uuid] = { action: 'REMOVE', lastRequestOn }`
- Writes the classic shadow once at the end
- Called from `refreshLayout()` after `updatePlacedCameraShadow()` and before `updatePlacedLockButtonShadow()`

This syncs the space assignment to the edge, which has no other mechanism to receive it.

### 6. Camera Shadow Processing (No Change Needed)

The existing `updatePlacedCameraShadow()` passes through the camera `locks` map (containing only `assetName` per lock) to the shadow. No button-related data is involved.

---

## Frontend Implementation

See [vue-gocheckin-host/doc/design/LOCK_BUTTON_COMPANION.md](../../../vue-gocheckin-host/doc/design/LOCK_BUTTON_COMPANION.md) for full frontend design.

**Key points**:
- Association is space-based (same pattern as camera-lock co-location)
- Inline Entry/Exit toggle on each placed LOCK_BUTTON asset
- `saveLayout` sets `companionOf`/`buttonType` on LOCK_BUTTON assets (co-located lock found by shared space)
- `loadAssets` reads `buttonType` from LOCK_BUTTON assets for round-trip persistence
- `getPlacedAssets` GQL query includes `locks`, `companionOf`, `buttonType` fields

---

## Edge Device Processing

The edge receives association data from the **LOCK_BUTTON named shadow**:

1. LOCK_BUTTON named shadow delta → `processLockButtonsShadowDelta()` writes `companionOf` and `buttonType` to the LOCK_BUTTON's local DynamoDB record
2. LOCK named shadow delta → `processLocksShadowDelta()` writes `roomCode` to the LOCK's local DynamoDB record
3. Button clicks resolve via `companionOf` → parent lock → `lock.cameras` chain:

| Button Type | Event Flow |
|-------------|------------|
| **Entry** | `handleButtonClickEvent()` → `companionOf` → parent lock → `lock.cameras` → `trigger_detection` → face match → unlock |
| **Exit** | `handleButtonClickEvent()` → `companionOf` → `unlockZbLock()` directly (no camera needed) |

See [../edge/LOCK_BUTTON_ASSOCIATION.md](../edge/LOCK_BUTTON_ASSOCIATION.md) for edge implementation details.

---

## Implementation Checklist

### Backend (sls-ts-gocheckin-host)

- [x] Add `CameraLockEntry` and `CameraLocks` interfaces in `assets.models.ts`
- [x] Fix `Asset.locks` type from `string[]` to `CameraLocks`
- [x] Add `companionOf` and `buttonType` to `Asset` interface in `assets.models.ts`
- [x] Add `locks: AWSJSON`, `companionOf: String`, `buttonType: String` to `type Asset` and `input AssetInput` in `schema.graphql`
- [x] Update `assets.dao.ts` to persist `companionOf`/`buttonType` on placed assets and REMOVE them on available assets
- [x] Add `updatePlacedLockButtonShadow()` method in `assets.service.ts` to sync LOCK_BUTTON named shadows + classic shadow `lockButtons[uuid]`
- [x] Add `updatePlacedLockShadow()` method in `assets.service.ts` to sync LOCK named shadows (`roomCode` from `inSpaces[0]`) + classic shadow `locks[uuid]`
- [x] Remove `entryButtons`/`exitButtons` from `CameraLockEntry` interface (no longer needed)
- [x] Simplify `saveLayout` camera locks to only include `assetName` (remove button grouping)
- [x] Simplify `loadAssets` to read `buttonType` from LOCK_BUTTON/KEYPAD assets only (remove camera locks fallback)

### Frontend (vue-gocheckin-host)

- [x] Add `locks`, `companionOf`, `buttonType` to `getPlacedAssets` GQL selection set in `appsync-gql.js`
- [x] Add `lockButtonTypes` state and mutations to `host.js`
- [x] Update `loadAssets` to extract button types from LOCK_BUTTON `buttonType` field
- [x] Update `saveLayout` to set `companionOf`/`buttonType` on LOCK_BUTTON assets
- [x] Add inline Entry/Exit toggle for LOCK_BUTTON assets in Layout.vue
- [x] Show button type on LOCK_BUTTON chips in Spaces panel
- [x] Remove `entryButtons`/`exitButtons` grouping logic from `saveLayout` camera locks builder
- [x] Remove camera locks fallback from `loadAssets` button type extraction

### Edge (ggp-func-ts-gocheckin)

- [ ] Process LOCK_BUTTON/KEYPAD named shadow delta (`processLockButtonsShadowDelta()`) to persist `companionOf`/`buttonType` locally
- [ ] Process LOCK/KEYPAD_LOCK named shadow delta (`processLocksShadowDelta()`) to persist `roomCode` locally
- [ ] Route classic shadow `lockButtons` entries to `processLockButtonsShadowDelta()`
- [ ] Route classic shadow `locks` entries to `processLocksShadowDelta()`
- [ ] Update `Z2mLock` model with `companionOf`, `buttonType`, `roomCode` fields
- [ ] Add `handleButtonClickEvent()` — resolve via `companionOf` → parent lock
- [ ] Add `hasEntryButtonsForLock()` DAO query

### Testing

- [ ] Associate entry button with LOCK via UI (place in same space, set Entry)
- [ ] Associate exit button with LOCK via UI (place in same space, set Exit)
- [ ] Verify LOCK_BUTTON DynamoDB record has `companionOf` and `buttonType`
- [ ] Verify LOCK_BUTTON named shadow has `companionOf` and `buttonType`
- [ ] Reload layout — verify button types persist (round-trip via `getPlacedAssets`)
- [ ] Test entry button → triggers detection → face match → unlock
- [ ] Test exit button → unlocks immediately (no detection, no camera needed)
- [ ] Test disassociation (move button to different space or remove from layout)

---

## Example: Full Flow

### 1. User Action (Frontend)

User places assets on Layout Editor canvas, all in the same space ("EntranceRight"):
- **Dahua** camera
- **MAG002** lock
- **DoorButton1** as entry button (toggle set to Entry)
- **ExitButton1** as exit button (toggle set to Exit)

### 2. Save Layout → API Call

`saveLayout` builds the placedAssets array. The CAMERA carries the `locks` map (lock names only). Each LOCK_BUTTON carries its own `companionOf`/`buttonType`:

```json
{
  "placedAssets": [
    {
      "uuid": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "category": "CAMERA",
      "coreName": "neoseed_Core",
      "layoutId": 0,
      "position": { "x": 180, "y": 280 },
      "inSpaces": ["space-entrance-right"],
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002"
        }
      }
    },
    {
      "uuid": "0xe4b323fffeb4b614",
      "category": "LOCK",
      "layoutId": 0,
      "position": { "x": 200, "y": 350 },
      "inSpaces": ["space-entrance-right"]
    },
    {
      "uuid": "0x00_greenpower_button_1",
      "category": "LOCK_BUTTON",
      "companionOf": "0xe4b323fffeb4b614",
      "buttonType": "ENTRY",
      "layoutId": 0,
      "position": { "x": 150, "y": 300 },
      "inSpaces": ["space-entrance-right"]
    },
    {
      "uuid": "0x00_greenpower_button_2",
      "category": "LOCK_BUTTON",
      "companionOf": "0xe4b323fffeb4b614",
      "buttonType": "EXIT",
      "layoutId": 0,
      "position": { "x": 160, "y": 310 },
      "inSpaces": ["space-entrance-right"]
    }
  ]
}
```

### 3. Backend Processing

`refreshLayout` → `handleAssets()` stores each asset in DynamoDB (including `companionOf`/`buttonType` on LOCK_BUTTONs) → `updatePlacedCameraShadow()` writes the camera's named shadow with the `locks` map + classic shadow `cameras[uuid]` → `updatePlacedLockShadow()` writes each LOCK's named shadow with `{ roomCode }` + classic shadow `locks[uuid]` → `updatePlacedLockButtonShadow()` writes each LOCK_BUTTON's named shadow with `{ companionOf, buttonType }` + classic shadow `lockButtons[uuid]`.

### 4. Shadow Updates (IoT)

**Camera named shadow** (keyed by camera uuid):

```json
{
  "state": {
    "desired": {
      "layoutId": 0,
      "position": { "x": 180, "y": 280 },
      "inSpaces": ["space-entrance-right"],
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002"
        }
      }
    }
  }
}
```

**LOCK named shadow** (keyed by lock uuid):

```json
// Named shadow: neoseed_Core / 0xe4b323fffeb4b614
{ "state": { "desired": { "roomCode": "space-entrance-right" } } }
```

**LOCK_BUTTON named shadows**:

```json
// Named shadow: neoseed_Core / 0x00_greenpower_button_1
{ "state": { "desired": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "ENTRY" } } }

// Named shadow: neoseed_Core / 0x00_greenpower_button_2
{ "state": { "desired": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "EXIT" } } }
```

**Classic (main) thing shadow** — notification entries for all asset types:

```json
{
  "state": {
    "desired": {
      "cameras": {
        "ea9a49f2-c236-4d6d-b82f-a0725a03f614": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      },
      "locks": {
        "0xe4b323fffeb4b614": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      },
      "lockButtons": {
        "0x00_greenpower_button_1": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." },
        "0x00_greenpower_button_2": { "action": "UPDATE", "lastRequestOn": "2026-02-21T..." }
      }
    }
  }
}
```

### 5. Edge Processing

- Classic shadow `lockButtons` entries → `processLockButtonsShadowDelta()` fetches each LOCK_BUTTON named shadow, writes `companionOf` + `buttonType` to local record
- Classic shadow `locks` entries → `processLocksShadowDelta()` fetches each LOCK named shadow, writes `roomCode` to local record
- Classic shadow `cameras` entries → `processCamerasShadowDelta()` fetches each camera named shadow, writes locks map to local record

### 6. Runtime

**Entry button press (outside)**:
```
DoorButton1 press → handleButtonClickEvent() → companionOf → parent lock → lock.cameras
    → trigger_detection { cam_ip, lock_asset_id }
    → face match → unlockByMemberDetected()
```

**Exit button press (inside)**:
```
ExitButton1 press → handleButtonClickEvent() → companionOf → unlockZbLock() directly
    (no camera, no detection)
```

---

## Files Reference

| Repository | File | Change |
|------------|------|--------|
| sls-ts-gocheckin-host | `src/functions/assets/assets.models.ts` | Fix `Asset.locks` type; add `companionOf`, `buttonType`; simplify `CameraLockEntry` |
| sls-ts-gocheckin-host | `schema.graphql` | Add `locks`, `companionOf`, `buttonType` to `type Asset` and `input AssetInput` |
| sls-ts-gocheckin-host | `src/functions/assets/assets.dao.ts` | Persist/remove `companionOf`, `buttonType` in `handleAssets()` |
| sls-ts-gocheckin-host | `src/functions/assets/assets.service.ts` | Add `updatePlacedLockShadow()` for LOCK named shadows; add `updatePlacedLockButtonShadow()` for LOCK_BUTTON named shadows |
| vue-gocheckin-host | `src/views/Layout.vue` | Add Entry/Exit toggle for LOCK_BUTTON assets |
| vue-gocheckin-host | `src/store/modules/host.js` | Add `lockButtonTypes` state; set `companionOf`/`buttonType` on LOCK_BUTTON in `saveLayout` |
| vue-gocheckin-host | `src/api/appsync-gql.js` | Add `locks`, `companionOf`, `buttonType` to `getPlacedAssets` selection set |
| ggp-func-ts-gocheckin | `assets.models.ts` | Add `companionOf`, `buttonType`, `roomCode` to `Z2mLock`; add `LockButtonEvent`, `ButtonType` |
| ggp-func-ts-gocheckin | `assets.service.ts` | Add `handleButtonClickEvent()`; add `processLockButtonsShadowDelta()`, `processLocksShadowDelta()` |
| ggp-func-ts-gocheckin | `handler.ts` | Add `action` event routing; route classic shadow `locks`/`lockButtons` entries to shadow processors |
