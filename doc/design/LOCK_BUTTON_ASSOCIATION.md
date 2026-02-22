# LOCK_BUTTON → LOCK Association Design

## Problem

MAG001AC (magnetic lock, category=`LOCK`) has no occupancy sensor. With the Phase 0A refactor, P2 cameras (cameras with locks) reject ONVIF triggers — detection only starts via P1 triggers (occupancy or button press). Without a companion device, MAG001AC locks have no way to trigger detection.

GreenPower_2 (category=`LOCK_BUTTON`) is a battery-free Zigbee button that sends **action events** (not occupancy). It needs to be associated with a LOCK so that a button press triggers actions:

| Button Type | Location | Behavior on Press |
|-------------|----------|-------------------|
| **Entry Button** | Outside / Entry side | Triggers face detection → Face match → Unlock |
| **Exit Button** | Inside / Behind door | Unlocks immediately (no detection) |

### Event Payloads

**KEYPAD_LOCK** (occupancy sensor):
```json
// topic: zigbee2mqtt/{deviceName}
{"occupancy": true, "linkquality": 200}
{"occupancy": false, "linkquality": 200}
```

**LOCK_BUTTON / GreenPower_2** (button click):
```json
// topic: zigbee2mqtt/{deviceName}
{"action": "press_1", "linkquality": 213}
```

---

## Design Principles

### Association Lives on LOCK_BUTTON

The LOCK_BUTTON record carries `companionOf` (parent lock assetId) and `buttonType` (ENTRY/EXIT):

1. **The click event arrives on the LOCK_BUTTON** — lookup starts there, so having the parent lock reference avoids scanning other records
2. **A camera is not mandatory** — an EXIT button only needs to unlock a lock, no camera involved
3. **Clean lookup chain** — LOCK_BUTTON → `companionOf` → LOCK → `lock.cameras` → trigger detection

### Local Records Mirror Cloud Records

Local DynamoDB records must be a simplified version of their cloud counterparts. The local record is a subset with edge-specific enrichments, not a different shape.

| Record | Cloud DynamoDB | Local DynamoDB | Relationship |
|--------|---------------|----------------|-------------|
| LOCK_BUTTON | `companionOf`, `buttonType` | Same + zigbee fields (model, vendor) | Local is superset |
| LOCK | No association data | No association data + `cameras` (edge-only bidirectional sync) | Consistent |
| CAMERA | `locks` map with `assetName` per lock | Same + enriched `assetId`, `category` | Local is enriched version |

Cloud is responsible for setting the association. The edge never writes association data — it only reads it.

---

## Data Examples

### IoT Named Shadows (Cloud → Edge)

**Camera named shadow** (thingName=coreName, shadowName=camera UUID):
```json
// Named shadow: neoseed_Core / ea9a49f2-c236-4d6d-b82f-a0725a03f614
{
  "state": {
    "desired": {
      "hostId": "rulin",
      "uuid": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "category": "CAMERA",
      "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "assetName": "Dahua",
      "localIp": "192.168.11.62",
      "isRecording": true,
      "isDetecting": true,
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002"
        }
      },
      "lastUpdateOn": "2026-02-08T12:02:15.525Z"
    }
  }
}
```

The camera shadow only sends `assetName` in the lock entry. `assetId` and `category` are enriched locally during `processCamerasShadowDelta()`.

**LOCK_BUTTON named shadow** (thingName=coreName, shadowName=button UUID):
```json
// Named shadow: neoseed_Core / 0x00_greenpower_button_1
{
  "state": {
    "desired": {
      "companionOf": "0xe4b323fffeb4b614",
      "buttonType": "ENTRY"
    }
  }
}
```

When a LOCK_BUTTON is removed from layout (made available), the shadow fields are set to `null`.

**LOCK / KEYPAD_LOCK named shadow** (thingName=coreName, shadowName=lock UUID):
```json
// Named shadow: neoseed_Core / 0xe4b323fffeb4b614
{
  "state": {
    "desired": {
      "roomCode": "space-entrance-right"
    }
  }
}
```

Both LOCK and KEYPAD_LOCK use the same named shadow structure. The cloud includes both categories in the classic shadow `locks` section. `roomCode` identifies which room/space the lock belongs to — used for security use-cases to show which room's lock has been touched. Lock-camera association is carried by the camera shadow's `locks` map; the edge builds the reverse `lock.cameras` map locally via `syncLockCameraReference()`.

### Edge Local DynamoDB (gocheckin_asset table)

**CAMERA record** (after shadow processing + enrichment):
```json
{
  "hostId": "rulin",
  "uuid": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
  "hostPropertyCode": "rulin-prop01",
  "propertyCode": "prop01",
  "coreName": "neoseed_Core",
  "category": "CAMERA",
  "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
  "assetName": "Dahua",
  "localIp": "192.168.11.62",
  "username": "admin",
  "password": "...",
  "rtsp": { "port": 554, "path": "/cam/realmonitor?channel=1&subtype=0", "codec": "h264", "framerate": 15 },
  "onvif": { "port": 80, "isSubscription": true, "isPullpoint": false },
  "isRecording": true,
  "isDetecting": true,
  "locks": {
    "0xe4b323fffeb4b614": {
      "assetId": "0xe4b323fffeb4b614",
      "assetName": "MAG002",
      "category": "LOCK"
    }
  },
  "inSpaces": ["space-entrance-right"],
  "layoutId": 0,
  "position": 1,
  "lastUpdateOn": "2026-02-08T12:02:15.525Z"
}
```

`category` is enriched from the local lock record. `withKeypad` was removed from camera lock entries per Decision 28 (see `doc/design/REMOVE_WITH_KEYPAD.md`).

**LOCK record** (from Zigbee discovery + bidirectional camera sync):
```json
{
  "hostId": "rulin",
  "uuid": "0xe4b323fffeb4b614",
  "hostPropertyCode": "rulin-prop01",
  "propertyCode": "prop01",
  "coreName": "neoseed_Core",
  "category": "LOCK",
  "assetId": "0xe4b323fffeb4b614",
  "assetName": "MAG001",
  "vendor": "GoCheckIn",
  "model": "MAG001AC",
  "state": false,
  "cameras": {
    "ea9a49f2-c236-4d6d-b82f-a0725a03f614": {
      "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "localIp": "192.168.11.62"
    }
  },
  "lastUpdateOn": "2026-02-08T..."
}
```

No association data on the lock record. The `cameras` map is populated by `syncLockCameraReference()` (edge-only bidirectional sync).

**LOCK_BUTTON record — Entry Button** (Zigbee discovery + association synced via shadow):
```json
{
  "hostId": "rulin",
  "uuid": "0x00_greenpower_button_1",
  "hostPropertyCode": "rulin-prop01",
  "propertyCode": "prop01",
  "coreName": "neoseed_Core",
  "category": "LOCK_BUTTON",
  "assetId": "0x00000000632afb2f",
  "assetName": "MAG001_ENTRY",
  "vendor": "GreenPower_2",
  "model": "GreenPower_2",
  "state": false,
  "companionOf": "0xe4b323fffeb4b614",
  "buttonType": "ENTRY",
  "lastUpdateOn": "2026-02-22T..."
}
```

**LOCK_BUTTON record — Exit Button** (Zigbee discovery + association synced via shadow):
```json
{
  "hostId": "rulin",
  "uuid": "0x00_greenpower_button_2",
  "hostPropertyCode": "rulin-prop01",
  "propertyCode": "prop01",
  "coreName": "neoseed_Core",
  "category": "LOCK_BUTTON",
  "assetId": "0x00000000a60beb16",
  "assetName": "MAG001_EXIT",
  "vendor": "GreenPower_2",
  "model": "GreenPower_2",
  "state": false,
  "companionOf": "0xe4b323fffeb4b614",
  "buttonType": "EXIT",
  "lastUpdateOn": "2026-02-22T..."
}
```

`companionOf` and `buttonType` are synced via LOCK_BUTTON named shadow from the cloud. The edge reads them at runtime via `processLockButtonShadowDelta()`.

---

## Runtime Logic: P1 and P2

### P1 — Direct Trigger (confirmed human presence)

| Source | Event | ts handler | py_handler receives |
|--------|-------|------------|---------------------|
| KEYPAD_LOCK | `occupancy: true` | `handleLockTouchEvent()` → lock → `lock.cameras` → trigger | `trigger_detection { cam_ip, lock_asset_id }` |
| LOCK_BUTTON (ENTRY) | `action: "press_1"` | `handleButtonClickEvent()` → `companionOf` → parent lock → `lock.cameras` → trigger | `trigger_detection { cam_ip, lock_asset_id }` (parent LOCK's ID) |
| LOCK_BUTTON (EXIT) | `action: "press_1"` | `handleButtonClickEvent()` → `companionOf` → `unlockZbLock()` directly | **Nothing** (direct unlock, no detection) |
| KEYPAD_LOCK | `occupancy: false` | `handleLockStopEvent()` | `stop_detection { cam_ip, lock_asset_id }` |

ENTRY button press and `occupancy: true` are functionally equivalent — both are P1 triggers that activate face detection. EXIT button skips detection entirely — direct unlock.

Unlike KEYPAD which sends `occupancy: false` to stop detection early, LOCK_BUTTON only sends press events. No explicit stop is needed — py_handler's `TIMER_DETECT` handles expiry naturally.

### P2 — ONVIF Motion (unconfirmed)

Per **Decision 28**, ONVIF motion starts surveillance-mode detection but never directly unlocks. The `withKeypad` gate was removed — ONVIF triggers always proceed to detection. Unlocking only happens when a clicked signal (occupancy sensor or button press) provides `clickedLocks` context.

### ts handler as Translation Boundary

py_handler has no knowledge of device categories, companion relationships, or button types. The ts handler encapsulates all lock-related complexity and translates it into `trigger_detection { cam_ip, lock_asset_id }`.

---

## Processing Flows

### Shadow Sync Flow

```
Cloud UI: associate GreenPower_2 buttons with MAG002 lock (as entry or exit)
    ↓
Cloud: sets companionOf + buttonType on LOCK_BUTTON DynamoDB record
Cloud: syncs LOCK_BUTTON named shadow with companionOf/buttonType
Cloud: syncs LOCK named shadow with roomCode
    ↓
Edge receives classic shadow delta with lockButtons and locks sections
    ↓
ggp-func-ts-gocheckin: processLockButtonsShadow()
    └── processLockButtonShadowDelta(uuid) for each LOCK_BUTTON
        └── writes companionOf + buttonType to LOCK_BUTTON record in local DynamoDB

ggp-func-ts-gocheckin: processLocksShadow()
    └── processLockShadowDelta(uuid) for each LOCK
        └── writes roomCode to LOCK record in local DynamoDB
```

### Camera Enrichment Flow

```
Edge receives camera named shadow delta (locks map with assetName per lock)
    ↓
ggp-func-ts-gocheckin: processCamerasShadowDelta()
    ├── for each lock in camera.locks:
    │     set assetId, query lock record for category
    ├── writes camera to gocheckin_asset (lock entry has assetId + category)
    └── publishes gocheckin/reset_camera
    ↓
py_handler: reloads camera config
```

---

## Model Changes

```typescript
// assets.models.ts

// GoCheckInLock is the camera's lock entry (camera.locks[assetId])
export interface GoCheckInLock {
    assetId: string;
    assetName: string;
    category: string;
}

export type ButtonType = 'ENTRY' | 'EXIT';

export interface LockButtonEvent {
    lockAssetName: string;
    action: string;  // "press_1", "press_2", etc.
}

// Z2mLock is the lock/button device record
export interface Z2mLock {
    // ... existing fields ...
    companionOf?: string;     // assetId of parent lock (LOCK_BUTTON only, synced via shadow)
    buttonType?: ButtonType;  // ENTRY or EXIT (LOCK_BUTTON only, synced via shadow)
}
```

---

## Code Changes

### handler.ts

Add `action` event routing alongside `occupancy`:

```typescript
// After occupancy block (line 79)
if (deviceName && 'action' in event) {
    await assetsService.handleButtonClickEvent({
        lockAssetName: deviceName,
        action: event.action
    });
}
```

### assets.service.ts — handleButtonClickEvent()

```typescript
public async handleButtonClickEvent(event: LockButtonEvent): Promise<any> {
    console.log('assets.service handleButtonClickEvent in: ' + JSON.stringify(event));

    // 1. Look up LOCK_BUTTON by friendly name
    const z2mLocks = await this.assetsDao.getZbLockByName(event.lockAssetName);
    if (z2mLocks.length === 0) return;
    const button = z2mLocks[0];

    // 2. Verify this is a companion button (association set by cloud via shadow)
    if (!button.companionOf) return;

    // 3. Resolve parent lock
    const parentLock = await this.assetsDao.getZbLockById(button.companionOf);
    if (!parentLock) return;

    // 4. Handle based on button type
    if (button.buttonType === 'EXIT') {
        await this.unlockZbLock(parentLock.assetId);
        return;
    }

    // ENTRY: trigger detection on parent lock's cameras
    if (!parentLock.cameras) return;

    for (const cameraAssetId of Object.keys(parentLock.cameras)) {
        const camera = parentLock.cameras[cameraAssetId];
        await this.iotService.publish({
            topic: 'gocheckin/trigger_detection',
            payload: JSON.stringify({ cam_ip: camera.localIp, lock_asset_id: parentLock.assetId })
        });
    }
}
```

### assets.service.ts — Camera Lock Enrichment

In `processCamerasShadowDelta()`:

```typescript
if (existingCamera.locks) {
    for (const lockAssetId of Object.keys(existingCamera.locks)) {
        existingCamera.locks[lockAssetId].assetId = lockAssetId;
        const lockRecord: Z2mLock = await this.assetsDao.getZbLockById(lockAssetId);
        if (lockRecord) {
            existingCamera.locks[lockAssetId].category = lockRecord.category;
        }
    }
}
```

Sets `assetId` and `category` on each lock entry. `withKeypad` was removed per Decision 28 (see `doc/design/REMOVE_WITH_KEYPAD.md`).

### assets.service.ts — LOCK Shadow Processing

```typescript
private async processLockShadowDelta(uuid: string): Promise<any> {
    const getShadowResult = await this.iotService.getShadow({ thingName, shadowName: uuid });
    const delta = getShadowResult.state.desired;

    const lock: Z2mLock = await this.assetsDao.getZbLockById(uuid);
    if (!lock) return;

    lock.roomCode = delta.roomCode || undefined;
    lock.lastUpdateOn = (new Date).toISOString();

    await this.assetsDao.updateLock(lock);
    await this.iotService.updateReportedShadow({ thingName, shadowName: uuid, reportedState: delta });
}
```

### assets.dao.ts

- `getZbLockByName()` filter includes `LOCK_BUTTON` category
- New `hasEntryButtonsForLock(lockAssetId)` query method

### ~~syncButtonAssociations()~~ — REMOVED

The edge does not write association data. `companionOf` and `buttonType` on LOCK_BUTTON records are managed by the cloud and synced via shadow.

---

## Implementation Checklist

### Cloud

1. Set `companionOf` and `buttonType` on LOCK_BUTTON DynamoDB records when user associates buttons
2. Sync `companionOf`/`buttonType` to edge via LOCK_BUTTON named shadow
3. Sync `roomCode` to edge via LOCK named shadow

### TypeScript (ggp-func-ts-gocheckin)

1. **assets.models.ts**: Add `companionOf?: string`, `buttonType?: ButtonType` to `Z2mLock`; add `LockButtonEvent`, `ButtonType` types. Remove `entryButtons`/`exitButtons` from `GoCheckInLock` and `Z2mLock`.
2. **handler.ts**: Add `action` event routing; add `lockButtons` and `locks` classic shadow routing
3. **assets.service.ts**: Add `handleButtonClickEvent()`; add `processLockButtonsShadow()`/`processLockButtonShadowDelta()` for LOCK_BUTTON shadow; add `processLocksShadow()`/`processLockShadowDelta()` for LOCK shadow; update `processCamerasShadowDelta()` to enrich `assetId` + `category`; remove `syncButtonAssociations()`
4. **assets.dao.ts**: Update `getZbLockByName()` filter to include `LOCK_BUTTON`

### Python (ggp-func-py-gocheckin) — No Changes

py_handler already handles `trigger_detection` with `lock_asset_id`. Exit buttons bypass py_handler entirely.

---

## Verification

### Entry Button Flow
1. Pair GreenPower_2 → discovered as `LOCK_BUTTON`
2. Cloud associates button as **entry** button with MAG001 → syncs LOCK_BUTTON named shadow
3. Edge: classic shadow `lockButtons` delta → `processLockButtonShadowDelta()` → writes `companionOf` + `buttonType=ENTRY` to local LOCK_BUTTON record
4. Press entry button → `handleButtonClickEvent()` → `companionOf` → parent lock → `lock.cameras` → `trigger_detection`
5. py_handler starts detection, timer expires naturally
6. Face match → unlock parent LOCK

### Exit Button Flow (camera not required)
1. Pair GreenPower_2 → discovered as `LOCK_BUTTON`
2. Cloud associates button as **exit** button with MAG001 → syncs LOCK_BUTTON named shadow
3. Edge: classic shadow `lockButtons` delta → `processLockButtonShadowDelta()` → writes `companionOf` + `buttonType=EXIT` to local LOCK_BUTTON record
4. Press exit button → `handleButtonClickEvent()` → `companionOf` → `unlockZbLock()` directly
5. Door unlocks immediately — no camera, no detection

---

## 2026-02-22: Cloud Association — Stale Shadow Investigation & Resolution

### Initial Observation

After deploying the `withKeypad` removal changes and re-syncing all shadows, a DynamoDB scan showed `entryButtons`/`exitButtons` arrays on camera lock entries and empty LOCK_BUTTON named shadows. This initially appeared to be a cloud implementation gap — `updatePlacedLockButtonShadow()` seemed unimplemented.

### Root Cause: Stale IoT Shadow Data

The issue was **stale shadow data**, not a missing cloud implementation. IoT shadows are stateful documents — old fields persist until explicitly overwritten by a new `updateDesiredShadow()` call. The camera named shadow retained `entryButtons`/`exitButtons` from a previous cloud deployment that used a different association approach. Simply deploying new backend code does not clean up existing shadows.

### Resolution

After re-discovering the Zigbee devices (new button IDs) and re-saving the layout from the cloud UI, all shadows and local records are correct:

**LOCK_BUTTON named shadows — `companionOf`/`buttonType` populated:**
```json
// neoseed_Core / 0x00000000632afb2f (MAG001_ENTRY)
{ "state": { "desired": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "ENTRY" },
             "reported": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "ENTRY" } } }

// neoseed_Core / 0x00000000a60beb16 (MAG001_EXIT)
{ "state": { "desired": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "EXIT" },
             "reported": { "companionOf": "0xe4b323fffeb4b614", "buttonType": "EXIT" } } }
```

**Camera named shadow — lock entries clean (no `entryButtons`/`exitButtons`):**
```json
"locks": {
    "0xe4b323fffeb4b614": { "assetName": "MAG001" },
    "0x98a316fffe8e7d80": { "assetName": "DC010" }
}
```

**Local DynamoDB — all records correct:**

| Record | Key Fields |
|---|---|
| LOCK_BUTTON MAG001_ENTRY | `companionOf: 0xe4b323fffeb4b614`, `buttonType: ENTRY` |
| LOCK_BUTTON MAG001_EXIT | `companionOf: 0xe4b323fffeb4b614`, `buttonType: EXIT` |
| LOCK MAG001 | `roomCode: adwJwZ`, `cameras: [ea9a49f2-...]` |
| KEYPAD_LOCK DC010 | `roomCode: adwJwZ`, `cameras: [ea9a49f2-...]` |
| CAMERA Dahua | `locks: { MAG001: { assetId, category: LOCK }, DC010: { assetId, category: KEYPAD_LOCK } }` |

### Lesson Learned

When debugging shadow-based sync issues, always consider that IoT named shadows may contain **stale data from previous deployments**. To clean up:
1. Delete the stale named shadows (`aws iot-data delete-thing-shadow`)
2. Delete local DDB records for affected assets
3. Re-discover devices (Zigbee) and re-save layout (cloud UI)

The cloud's `companionOf` model (`LOCK_BUTTON_COMPANION.md`) is fully implemented and working end-to-end.

---

## Files

| File | Repo | Action |
|------|------|--------|
| `packages/src/functions/assets/assets.models.ts` | ts | Add `companionOf`, `buttonType` to `Z2mLock`; add `LockButtonEvent`, `ButtonType`. Remove `entryButtons`/`exitButtons`. |
| `packages/src/handler.ts` | ts | Add `action` event routing; add LOCK_BUTTON named shadow delta routing |
| `packages/src/functions/assets/assets.service.ts` | ts | Add `handleButtonClickEvent()`; update lock enrichment; remove `syncButtonAssociations()` |
| `packages/src/functions/assets/assets.dao.ts` | ts | Update `getZbLockByName()` filter to include `LOCK_BUTTON` |
| Cloud API/UI | cloud | Set `companionOf`/`buttonType` on LOCK_BUTTON records; sync via named shadow |
| py_handler.py | py | No changes needed |
