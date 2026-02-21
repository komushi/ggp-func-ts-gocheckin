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
3. Include `entryButtons` and `exitButtons` arrays in the camera shadow lock entry
4. Edge device processes these associations for appropriate behavior

---

## Key Architecture: Dual Association Model

Association data now lives in **two places**:

1. **CAMERA `locks` map** — carries `entryButtons[]`/`exitButtons[]` per lock (used by edge for `withKeypad` enrichment)
2. **LOCK_BUTTON record** — carries `companionOf` (parent lock UUID) and `buttonType` (`'ENTRY'` | `'EXIT'`) directly on the DynamoDB record and its own named IoT shadow

The LOCK_BUTTON named shadow is the **primary source** the edge reads for button-to-lock association. Camera `entryButtons`/`exitButtons` remain for backwards compatibility and `withKeypad` derivation.

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

`companionOf` is the UUID of the parent LOCK/KEYPAD_LOCK. `buttonType` is `'ENTRY'` or `'EXIT'`. These fields are set by the frontend at save time and persisted in DynamoDB. They are also synced to a LOCK_BUTTON named IoT shadow (see below). The button type is also written into the camera's `locks[lockUuid].entryButtons[]` or `locks[lockUuid].exitButtons[]` array as a UUID reference (for `withKeypad` enrichment).

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

No `entryButtons`, no `exitButtons`, no `withKeypad`, no `companions`. The lock does not know which buttons are associated with it. That information is stored on the camera's `locks` map and on LOCK_BUTTON records via `companionOf`. The edge device derives `withKeypad` locally during shadow processing — it is never stored in the cloud DynamoDB record for a LOCK.

**CAMERA** — carries the `locks` map with all associations:

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
      "assetName": "MAG002",
      "entryButtons": ["0x00_greenpower_button_1"],
      "exitButtons": ["0x00_greenpower_button_2"]
    }
  },
  "lastUpdateOn": "2026-02-20T..."
}
```

### Camera IoT Device Shadow

The camera's named shadow mirrors the `locks` map from DynamoDB. Used for `withKeypad` enrichment:

```json
{
  "state": {
    "desired": {
      "layoutId": 0,
      "position": { "x": 180, "y": 280 },
      "inSpaces": ["space-entrance-right"],
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002",
          "entryButtons": ["0x00_greenpower_button_1"],
          "exitButtons": ["0x00_greenpower_button_2"]
        }
      }
    }
  }
}
```

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

When a LOCK_BUTTON is made available (removed from layout), the shadow fields are set to `null`:

```json
{
  "state": {
    "desired": {
      "companionOf": null,
      "buttonType": null
    }
  }
}
```

### Summary Table

| Record | Has association data? | What it stores |
|--------|----------------------|----------------|
| **LOCK_BUTTON (DynamoDB)** | **Yes** | `companionOf`, `buttonType`, position, inSpaces |
| **LOCK_BUTTON (IoT shadow)** | **Yes** | `companionOf`, `buttonType` — primary source for edge |
| LOCK (DynamoDB) | No | position, inSpaces, category only |
| **CAMERA (DynamoDB)** | **Yes** | `locks` map with `entryButtons[]`/`exitButtons[]` per lock |
| **CAMERA (IoT shadow)** | **Yes** | Same `locks` map — used for `withKeypad` enrichment |

---

## Current State

### Camera Shadow Lock Entry (Current)

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

### Asset Model (Current — before fix)

```typescript
// assets.models.ts
export interface Asset {
    // ...
    locks?: string[];  // BUG: typed as string[] but used as Record<string, object>
}
```

### GraphQL Schema (Current — before fix)

```graphql
input AssetInput {
    locks: AWSJSON  # Flexible, can accept any JSON
}

type Asset {
    # ... no locks field — locks not returned to frontend
}
```

---

## Target State

### Camera Shadow Lock Entry (Target)

```json
{
  "state": {
    "desired": {
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002",
          "entryButtons": ["0x00_greenpower_button_1"],
          "exitButtons": ["0x00_greenpower_button_2"]
        }
      }
    }
  }
}
```

Two separate arrays distinguish button purposes:
- `entryButtons`: Trigger face detection before unlock
- `exitButtons`: Unlock directly without detection

---

## Data Model Changes

### New Interface: CameraLockEntry

```typescript
// assets.models.ts

export interface CameraLockEntry {
    assetName: string;
    entryButtons?: string[];  // LOCK_BUTTONs that trigger detection before unlock
    exitButtons?: string[];   // LOCK_BUTTONs that unlock directly (no detection)
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
    locks?: CameraLocks;  // Fixed from string[] to CameraLocks
    lastUpdateOn?: string;
}
```

---

## GraphQL Schema Changes

### Add `locks` to Asset return type (Required)

The `type Asset` must include `locks` so that `getPlacedAssets` can return the locks map to the frontend. Without this, button type assignments are lost on page reload.

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

---

## Data Flow

### Save Flow (Frontend → Backend → Shadow)

```
Frontend Layout Editor
│  User places LOCK_BUTTON on canvas → assigns to same space as LOCK + CAMERA
│  User sets button type (Entry/Exit) via inline toggle
│  State: lockButtonTypes[buttonUuid] = 'ENTRY' | 'EXIT'
│
▼ saveLayout() in host.js
│  For each CAMERA asset:
│    1. Find co-located LOCKs (same inSpaces)
│    2. Find co-located LOCK_BUTTONs (same inSpaces as camera AND lock)
│    3. Split buttons by type from lockButtonTypes (default: ENTRY)
│    4. Build: camera.locks = { [lockUuid]: { assetName, entryButtons[], exitButtons[] } }
│
▼ appsync.refreshLayout({ placedAssets }) → GraphQL mutation
│  AssetInput.locks typed as AWSJSON
│  Client sends locks as JSON string; AppSync parses to object before Lambda
│
▼ Lambda: handler.ts → refreshLayoutGql(event)
│  event.placedAssets[n].locks is already a plain JS object
│
▼ AssetsService.refreshLayout(...)
│  ├─ assetsDao.handleAssets()           → DynamoDB (stores locks as native Map on camera)
│  └─ updatePlacedCameraShadow()         → IoT Shadow (merges locks into camera shadow)
│
▼ IoT Shadow delta triggers edge processing
```

### Load Flow (Backend → Frontend)

```
Layout.vue mounted → loadAssets action
│
▼ getPlacedAssets GraphQL query (includes locks field)
│  AppSync returns locks as AWSJSON string
│
▼ host.js loadAssets action
│  For each CAMERA with locks:
│    Parse locks (AWSJSON arrives as string)
│    Extract button types: entryButtons[] → 'ENTRY', exitButtons[] → 'EXIT'
│    Populate lockButtonTypes state
│
▼ UI restores Entry/Exit toggle state on each LOCK_BUTTON
```

### Shadow Processing Detail (updatePlacedCameraShadow)

```
For each placed CAMERA:
  1. getShadow(coreName, uuid) — read existing named shadow
  2. Merge/diff new locks vs old shadow locks:
     - New lock entry → add to updatedLocks
     - Changed lock entry → overwrite (includes new entryButtons/exitButtons)
     - Lock absent from new payload → set to null (IoT shadow delete)
  3. updateDesiredShadow(updatedShadow, coreName, uuid) — named shadow
  4. updateFullShadow(shadowFullState, coreName) — main thing shadow
```

---

## Backend Implementation

### 1. Update Asset Model

**File**: `src/functions/assets/assets.models.ts`

```typescript
export interface CameraLockEntry {
    assetName: string;
    entryButtons?: string[];
    exitButtons?: string[];
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

Add `locks: AWSJSON` to the `type Asset` return type:

```graphql
type Asset @aws_iam @aws_cognito_user_pools {
    # ... existing fields ...
    locks: AWSJSON
    lastUpdateOn: AWSDateTime
}
```

### 3. DynamoDB DAO — Persist and Remove Fields

**File**: `src/functions/assets/assets.dao.ts`

In `handleAssets()`:
- **Available assets**: Added `companionOf, buttonType` to the REMOVE expression
- **Placed assets**: Conditionally SET `companionOf` and `buttonType` if present on the asset (same pattern as `locks`)

### 4. Service — LOCK_BUTTON Named Shadow

**File**: `src/functions/assets/assets.service.ts`

New method `updatePlacedLockButtonShadow(placedAssets, availableAssets)`:
- For each placed LOCK_BUTTON: updates named shadow (thingName=coreName, shadowName=button.uuid) with `{ companionOf, buttonType }`
- For each available LOCK_BUTTON: sets `companionOf` and `buttonType` to `null` in the named shadow
- Called from `refreshLayout()` after `updatePlacedCameraShadow()`

### 5. Camera Shadow Processing (No Change Needed)

The existing `updatePlacedCameraShadow()` method already handles lock entries as objects and passes through any properties (including `entryButtons`/`exitButtons`) to the shadow. The `entryButtons`/`exitButtons` arrays on camera locks remain for `withKeypad` derivation.

---

## Frontend Implementation

See [vue-gocheckin-host/doc/design/LOCK_BUTTON_COMPANION.md](../../../vue-gocheckin-host/doc/design/LOCK_BUTTON_COMPANION.md) for full frontend design.

**Key points**:
- Association is space-based (same pattern as camera-lock co-location)
- Inline Entry/Exit toggle on each placed LOCK_BUTTON asset
- `saveLayout` in `host.js` builds the `locks` map with `entryButtons`/`exitButtons`
- `loadAssets` extracts button types from camera locks data for round-trip persistence
- `getPlacedAssets` GQL query includes `locks` field

---

## Edge Device Processing

When edge receives the updated camera shadow:

1. `processCamerasShadowDelta()` extracts `entryButtons` and `exitButtons` from lock entry
2. Sets `companionOf` and `buttonType` on each LOCK_BUTTON record
3. Sets `entryButtons` and `exitButtons` on parent LOCK record
4. Enriches `withKeypad = true` for locks with entry buttons
5. Button clicks resolve based on type:

| Button Type | Event Flow |
|-------------|------------|
| **Entry** | `handleButtonClickEvent()` → `trigger_detection` → face match → unlock |
| **Exit** | `handleButtonClickEvent()` → `unlockZbLock()` directly |

See [../edge/LOCK_BUTTON_ASSOCIATION.md](../edge/LOCK_BUTTON_ASSOCIATION.md) for edge implementation details.

---

## Implementation Checklist

### Backend (sls-ts-gocheckin-host)

- [x] Add `CameraLockEntry` and `CameraLocks` interfaces in `assets.models.ts`
- [x] Fix `Asset.locks` type from `string[]` to `CameraLocks`
- [x] Add `companionOf` and `buttonType` to `Asset` interface in `assets.models.ts`
- [x] Add `locks: AWSJSON`, `companionOf: String`, `buttonType: String` to `type Asset` and `input AssetInput` in `schema.graphql`
- [x] Update `assets.dao.ts` to persist `companionOf`/`buttonType` on placed assets and REMOVE them on available assets
- [x] Add `updatePlacedLockButtonShadow()` method in `assets.service.ts` to sync LOCK_BUTTON named shadows
- [x] Verify `updatePlacedCameraShadow()` passes button arrays correctly (no change needed)

### Frontend (vue-gocheckin-host)

- [x] Add `locks` to `getPlacedAssets` GQL selection set in `appsync-gql.js`
- [x] Add `lockButtonTypes` state and mutations to `host.js`
- [x] Update `loadAssets` to extract button types from camera locks data
- [x] Update `saveLayout` to find co-located LOCK_BUTTONs and group into `entryButtons`/`exitButtons`
- [x] Add inline Entry/Exit toggle for LOCK_BUTTON assets in Layout.vue
- [x] Show button type on LOCK_BUTTON chips in Spaces panel

### Edge (ggp-func-ts-gocheckin)

- [ ] Update `processCamerasShadowDelta()` to handle `entryButtons`/`exitButtons`
- [ ] Update `Z2mLock` model with `buttonType` field
- [ ] Update `handleButtonClickEvent()` to check button type
- [ ] Entry button → `trigger_detection`
- [ ] Exit button → `unlockZbLock()` directly

### Testing

- [ ] Associate entry button with LOCK via UI (place in same space, set Entry)
- [ ] Associate exit button with LOCK via UI (place in same space, set Exit)
- [ ] Verify camera DynamoDB record includes `locks` with both arrays
- [ ] Verify camera shadow includes both arrays
- [ ] Reload layout — verify button types persist (round-trip via `getPlacedAssets`)
- [ ] Test entry button → triggers detection → face match → unlock
- [ ] Test exit button → unlocks immediately (no detection)
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

`saveLayout` builds the placedAssets array. Only the CAMERA carries the association:

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
          "assetName": "MAG002",
          "entryButtons": ["0x00_greenpower_button_1"],
          "exitButtons": ["0x00_greenpower_button_2"]
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
      "layoutId": 0,
      "position": { "x": 150, "y": 300 },
      "inSpaces": ["space-entrance-right"]
    },
    {
      "uuid": "0x00_greenpower_button_2",
      "category": "LOCK_BUTTON",
      "layoutId": 0,
      "position": { "x": 160, "y": 310 },
      "inSpaces": ["space-entrance-right"]
    }
  ]
}
```

### 3. Backend Processing

`refreshLayout` → `handleAssets()` stores each asset in DynamoDB → `updatePlacedCameraShadow()` writes the camera's named shadow with the `locks` map.

### 4. Shadow Update (IoT)

Camera named shadow (keyed by camera uuid):

```json
{
  "state": {
    "desired": {
      "layoutId": 0,
      "position": { "x": 180, "y": 280 },
      "inSpaces": ["space-entrance-right"],
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002",
          "entryButtons": ["0x00_greenpower_button_1"],
          "exitButtons": ["0x00_greenpower_button_2"]
        }
      }
    }
  }
}
```

### 5. Edge Processing

- Sets `companionOf: "0xe4b323fffeb4b614"` and `buttonType: "ENTRY"` on button_1
- Sets `companionOf: "0xe4b323fffeb4b614"` and `buttonType: "EXIT"` on button_2
- Sets `entryButtons` and `exitButtons` on MAG002 record
- Enriches camera lock entry with `withKeypad: true` (has entry buttons)

### 6. Runtime

**Entry button press (outside)**:
```
DoorButton1 press → handleButtonClickEvent() → buttonType=ENTRY
    → trigger_detection { cam_ip, lock_asset_id }
    → face match → unlockByMemberDetected()
```

**Exit button press (inside)**:
```
ExitButton1 press → handleButtonClickEvent() → buttonType=EXIT
    → unlockZbLock() directly (no detection)
```

---

## Files Reference

| Repository | File | Change |
|------------|------|--------|
| sls-ts-gocheckin-host | `src/functions/assets/assets.models.ts` | Add `CameraLockEntry`, `CameraLocks`; fix `Asset.locks` type; add `companionOf`, `buttonType` |
| sls-ts-gocheckin-host | `schema.graphql` | Add `locks`, `companionOf`, `buttonType` to `type Asset` and `input AssetInput` |
| sls-ts-gocheckin-host | `src/functions/assets/assets.dao.ts` | Persist/remove `companionOf`, `buttonType` in `handleAssets()` |
| sls-ts-gocheckin-host | `src/functions/assets/assets.service.ts` | Add `updatePlacedLockButtonShadow()` for LOCK_BUTTON named shadows |
| vue-gocheckin-host | `src/views/Layout.vue` | Add Entry/Exit toggle for LOCK_BUTTON assets |
| vue-gocheckin-host | `src/store/modules/host.js` | Add `lockButtonTypes` state; update `saveLayout` and `loadAssets` |
| vue-gocheckin-host | `src/api/appsync-gql.js` | Add `locks` to `getPlacedAssets` selection set |
| ggp-func-ts-gocheckin | `assets.models.ts` | Add `buttonType` to Z2mLock |
| ggp-func-ts-gocheckin | `assets.service.ts` | Update shadow processing and button handler |
| ggp-func-ts-gocheckin | `handler.ts` | Route button events with type awareness |
