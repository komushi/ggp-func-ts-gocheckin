# LOCK_BUTTON → LOCK Association Design

## Problem

MAG001AC (magnetic lock, category=`LOCK`) has no occupancy sensor. Currently `withKeypad=false`, which in the old code meant ONVIF motion triggered detection. With the Phase 0A refactor, P2 cameras (cameras with locks) reject ONVIF triggers entirely — detection only starts via occupancy events.

GreenPower_2 (category=`LOCK_BUTTON`) is a battery-free Zigbee button that sends **action events** (not occupancy). It needs to be associated with a LOCK so that a button press triggers the same face detection flow as `occupancy=true`.

## Current State

### Event Payloads

**KEYPAD/KEYPAD_LOCK** (occupancy sensor):
```json
// topic: zigbee2mqtt/{deviceName}
{"occupancy": true, "linkquality": 200}
{"occupancy": false, "linkquality": 200}
```

**LOCK_BUTTON (GreenPower_2)** (button click):
```json
// topic: zigbee2mqtt/{deviceName}
{"action": "press_1", "linkquality": 213}
```

### Current handler.ts Routing (lines 66-79)

Only handles `occupancy` attribute — `action` events are ignored:
```typescript
if (deviceName && 'occupancy' in event) {
    if (event.occupancy === true)  → handleLockTouchEvent()
    if (event.occupancy === false) → handleLockStopEvent()
}
// 'action' in event → NOT HANDLED
```

### Data Model

- **Cloud → Shadow → Local DynamoDB flow**:
  1. Cloud sets camera named shadow with `locks` map (camera → lock associations)
  2. `ggp-func-ts-gocheckin` receives shadow delta via `processCamerasShadowDelta()`
  3. Enriches `locks[].withKeypad` from local Z2mLock records
  4. Writes to local DynamoDB (`gocheckin_asset` table)
  5. Publishes `gocheckin/reset_camera` → py_handler reloads camera config

- **Local Z2mLock** (populated by Zigbee discovery):
  - `Z2mLock.cameras` — bidirectional link to cameras (synced by `syncLockCameraReference()`)
  - `Z2mLock.category` — `LOCK_BUTTON` for GreenPower_2
  - `Z2mLock.withKeypad` — `false` for LOCK_BUTTON (not in `ZB_CAT_WITH_KEYPAD`)

- **Camera `.locks` map** (from cloud shadow, enriched locally):
  - `GoCheckInLock { assetId, assetName, withKeypad, category }`
  - `withKeypad` enriched from local Z2mLock at `processCamerasShadowDelta()` line 136-150

### Association Gap

LOCK_BUTTON is its own Z2mLock record. The camera's `.locks` map (from cloud) references the LOCK (MAG001AC), not the LOCK_BUTTON. The cloud manages lock-camera associations. Even if we handle the button click event locally, there's no path from LOCK_BUTTON → camera without resolving the parent LOCK.

## Current Example: Camera-Lock Association

### Named Shadow (Cloud → Device)

Camera `ea9a49f2` (Dahua, 192.168.11.62) has a named shadow on thing `neoseed_Core`:

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

Note: The cloud shadow only sends `assetName` in the lock entry. `withKeypad` is enriched locally by `processCamerasShadowDelta()` from the Z2mLock record.

### Local DynamoDB (gocheckin_asset table)

**Camera record** (after shadow processing + enrichment):
```json
{
  "hostId": "rulin",
  "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
  "category": "CAMERA",
  "assetName": "Dahua",
  "localIp": "192.168.11.62",
  "isDetecting": true,
  "isRecording": true,
  "locks": {
    "0xe4b323fffeb4b614": {
      "assetId": "0xe4b323fffeb4b614",
      "assetName": "MAG002",
      "withKeypad": false
    }
  }
}
```

**Lock record** (from Zigbee discovery + bidirectional sync):
```json
{
  "hostId": "rulin",
  "assetId": "0xe4b323fffeb4b614",
  "uuid": "0xe4b323fffeb4b614",
  "category": "LOCK",
  "assetName": "MAG002",
  "model": "MAG001AC",
  "withKeypad": false,
  "cameras": {
    "ea9a49f2-c236-4d6d-b82f-a0725a03f614": {
      "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "localIp": "192.168.11.62"
    }
  }
}
```

**Problem**: `withKeypad: false` → py_handler P2 gate rejects ONVIF, and no occupancy sensor exists to trigger detection.

## Design

### LOCK_BUTTON as Companion Device

The LOCK_BUTTON ↔ LOCK association is managed from the cloud via device shadow, same as camera-lock associations. The cloud sets `companions` on the camera's lock entry, ggp-func-ts-gocheckin processes it to local DynamoDB.

### Target State: Shadow with LOCK_BUTTON Companion

```json
// Named shadow: neoseed_Core / ea9a49f2-c236-4d6d-b82f-a0725a03f614
{
  "state": {
    "desired": {
      "hostId": "rulin",
      "uuid": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "category": "CAMERA",
      "assetName": "Dahua",
      "localIp": "192.168.11.62",
      "isRecording": true,
      "isDetecting": true,
      "locks": {
        "0xe4b323fffeb4b614": {
          "assetName": "MAG002",
          "companions": ["0x00_greenpower_button_1"]
        }
      },
      "lastUpdateOn": "2026-02-18T12:00:00.000Z"
    }
  }
}
```

The only change from the current shadow: `companions` array added to the lock entry, containing the LOCK_BUTTON's assetId (its Zigbee IEEE address assigned at pairing).

### Target State: Local DynamoDB After Processing

**Camera record** (enriched):
```json
{
  "hostId": "rulin",
  "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
  "category": "CAMERA",
  "assetName": "Dahua",
  "localIp": "192.168.11.62",
  "isDetecting": true,
  "isRecording": true,
  "locks": {
    "0xe4b323fffeb4b614": {
      "assetId": "0xe4b323fffeb4b614",
      "assetName": "MAG002",
      "withKeypad": true,
      "companions": ["0x00_greenpower_button_1"]
    }
  }
}
```

`withKeypad` is now `true` because the lock has a companion device.

**Lock record** (MAG001AC — updated with companions):
```json
{
  "hostId": "rulin",
  "assetId": "0xe4b323fffeb4b614",
  "uuid": "0xe4b323fffeb4b614",
  "category": "LOCK",
  "assetName": "MAG002",
  "model": "MAG001AC",
  "withKeypad": false,
  "companions": ["0x00_greenpower_button_1"],
  "cameras": {
    "ea9a49f2-c236-4d6d-b82f-a0725a03f614": {
      "assetId": "ea9a49f2-c236-4d6d-b82f-a0725a03f614",
      "localIp": "192.168.11.62"
    }
  }
}
```

Note: `withKeypad` stays `false` on the lock record itself (MAG001AC has no built-in sensor). The enrichment logic checks `companions.length > 0` to override `withKeypad=true` on the camera's lock entry.

**LOCK_BUTTON record** (from Zigbee discovery + companionOf set during shadow processing):
```json
{
  "hostId": "rulin",
  "assetId": "0x00_greenpower_button_1",
  "uuid": "0x00_greenpower_button_1",
  "category": "LOCK_BUTTON",
  "assetName": "DoorButton1",
  "model": "GreenPower_2",
  "withKeypad": true,
  "companionOf": "0xe4b323fffeb4b614"
}
```

### Processing Flow

```
Cloud UI: associate GreenPower_2 button with MAG001AC lock
    ↓
Cloud: update camera named shadow — adds companions to lock entry
    ↓
ggp-func-ts-gocheckin: processCamerasShadowDelta()
    ├── enriches withKeypad: companions.length > 0 → true
    ├── writes camera to gocheckin_asset (withKeypad=true)
    ├── syncs companions to Z2mLock (MAG001AC) record
    ├── sets companionOf on Z2mLock (GreenPower_2) record
    └── publishes gocheckin/reset_camera
    ↓
py_handler: reloads camera config — sees withKeypad=true
    ↓
Runtime: button click → handleButtonClickEvent() → companionOf → parent lock → trigger_detection
```

### GoCheckInLock Model Change

```typescript
// assets.models.ts
export interface GoCheckInLock {
    assetId: string;
    assetName: string;
    withKeypad: boolean;
    category?: string;
    companions?: string[];  // NEW: assetIds of companion devices (LOCK_BUTTON)
}

export interface Z2mLock {
    // ... existing fields ...
    companionOf?: string;    // assetId of parent lock (set on LOCK_BUTTON)
    companions?: string[];   // assetIds of companion devices (set on parent LOCK)
}
```

### Camera Lock Enrichment Change

In `processCamerasShadowDelta()` (line 136-150):

```typescript
if (existingCamera.locks) {
    for (const lockAssetId of Object.keys(existingCamera.locks)) {
        const lockRecord: Z2mLock = await this.assetsDao.getZbLockById(lockAssetId);
        const lockEntry = existingCamera.locks[lockAssetId];

        // Propagate companions from shadow to lock record
        if (lockEntry.companions && lockEntry.companions.length > 0) {
            // Sync companions to Z2mLock record
            await this.syncCompanions(lockAssetId, lockEntry.companions);
        }

        if (lockRecord) {
            // withKeypad = true if lock has built-in sensor OR has companion devices
            const hasCompanion = lockEntry.companions && lockEntry.companions.length > 0;
            existingCamera.locks[lockAssetId].withKeypad = lockRecord.withKeypad || hasCompanion;
            existingCamera.locks[lockAssetId].assetId = lockAssetId;
        } else {
            existingCamera.locks[lockAssetId].withKeypad = false;
            existingCamera.locks[lockAssetId].assetId = lockAssetId;
        }
    }
}
```

### Configuration Change

```conf
# function.conf — add LOCK_BUTTON to ZB_CAT_WITH_KEYPAD
ZB_CAT_WITH_KEYPAD = "KEYPAD,KEYPAD_LOCK,LOCK_BUTTON"
```

### handler.ts Change

Add `action` event routing alongside `occupancy`:

```typescript
// handler.ts — after occupancy block (line 79)
if (deviceName && 'action' in event) {
    await assetsService.handleButtonClickEvent({
        lockAssetName: deviceName,
        action: event.action
    });
}
```

### New Method: handleButtonClickEvent()

```typescript
// assets.service.ts
public async handleButtonClickEvent(event: LockButtonEvent): Promise<any> {
    console.log('assets.service handleButtonClickEvent in: ' + JSON.stringify(event));

    // 1. Look up LOCK_BUTTON by friendly name
    const z2mLocks = await this.assetsDao.getZbLockByName(event.lockAssetName);
    if (z2mLocks.length === 0) return;
    const button = z2mLocks[0];

    // 2. Resolve parent lock via companionOf
    if (!button.companionOf) {
        console.log(`handleButtonClickEvent - no companionOf for: ${button.assetId}`);
        return;
    }
    const parentLock = await this.assetsDao.getZbLockById(button.companionOf);
    if (!parentLock || !parentLock.cameras) {
        console.log(`handleButtonClickEvent - parent lock or cameras not found: ${button.companionOf}`);
        return;
    }

    // 3. Trigger detection using parent lock's cameras and parent lock's assetId
    const triggerPromises = Object.keys(parentLock.cameras).map(async (cameraAssetId: string) => {
        const camera = parentLock.cameras[cameraAssetId];
        console.log(`handleButtonClickEvent triggering for camera: ${camera.localIp}`);

        await this.iotService.publish({
            topic: 'gocheckin/trigger_detection',
            payload: JSON.stringify({ cam_ip: camera.localIp, lock_asset_id: parentLock.assetId })
        });

        return { cameraIp: camera.localIp, status: 'triggered' };
    });

    await Promise.allSettled(triggerPromises);
    console.log('assets.service handleButtonClickEvent out');
}
```

### New Model

```typescript
// assets.models.ts
export interface LockButtonEvent {
    lockAssetName: string;
    action: string;  // "press_1", "press_2", etc.
}
```

### Shadow Processing for Companion Association

When the cloud sends the LOCK_BUTTON ↔ LOCK association via shadow:

```typescript
// assets.service.ts — new or extended shadow handler
private async processCompanionAssociation(buttonAssetId: string, parentLockAssetId: string): Promise<void> {
    // 1. Set companionOf on the LOCK_BUTTON record
    const button = await this.assetsDao.getZbLockById(buttonAssetId);
    if (button) {
        button.companionOf = parentLockAssetId;
        await this.assetsDao.updateLock(button);
    }

    // 2. Add to companions array on parent LOCK
    const parentLock = await this.assetsDao.getZbLockById(parentLockAssetId);
    if (parentLock) {
        if (!parentLock.companions) parentLock.companions = [];
        if (!parentLock.companions.includes(buttonAssetId)) {
            parentLock.companions.push(buttonAssetId);
        }
        await this.assetsDao.updateLock(parentLock);
    }

    // 3. Re-enrich camera locks (withKeypad now true for parent)
    //    Camera shadow will be re-processed, or trigger explicit re-sync
    if (parentLock?.cameras) {
        for (const cameraAssetId of Object.keys(parentLock.cameras)) {
            const camera = await this.assetsDao.getCamera(process.env.HOST_ID, cameraAssetId);
            if (camera?.locks?.[parentLockAssetId]) {
                camera.locks[parentLockAssetId].withKeypad = true;
                await this.assetsDao.updateCamera(camera);
            }
        }
        // Notify py_handler to reload
        await this.iotService.publish({
            topic: 'gocheckin/reset_camera',
            payload: JSON.stringify({})
        });
    }
}
```

### py_handler Event Contract

With this design, py_handler's trigger sources are cleanly separated:

- **ONVIF motion** → `handle_notification()` → recording only (P2 cameras) or recording + detection (P1 cameras with no locks)
- **Lock events** → `trigger_face_detection(cam_ip, lock_asset_id)` — always arrives with a specific `lock_asset_id`

ONVIF has nothing to do with lock actions in py_handler. The ts handler is the sole translation boundary for all lock-related triggers:

| Zigbee Event | ts handler | py_handler receives |
|---|---|---|
| KEYPAD/KEYPAD_LOCK `occupancy: true` | `handleLockTouchEvent()` | `trigger_detection { cam_ip, lock_asset_id }` |
| LOCK_BUTTON `action: "press_1"` | `handleButtonClickEvent()` → resolve `companionOf` | `trigger_detection { cam_ip, lock_asset_id }` (parent LOCK's ID) |
| KEYPAD/KEYPAD_LOCK `occupancy: false` | `handleLockStopEvent()` | `stop_detection { cam_ip, lock_asset_id }` |

py_handler is guaranteed to receive a specified lock's assetId for every lock-triggered detection. It has no knowledge of device categories, companion relationships, or button vs sensor — that complexity is fully encapsulated in the ts handler.

### Stop Detection Consideration

Unlike KEYPAD which sends `occupancy:false` to stop detection early, LOCK_BUTTON only sends press events.

**No explicit stop needed**: py_handler's `TIMER_DETECT` (via `feed_detecting()`) handles expiry naturally. The button press triggers detection, and it runs for the configured duration. This is consistent with how P1 (ONVIF) detection already works — timer-based expiry, no explicit stop.

## Implementation Steps

### Cloud (outside scope — API/UI)

1. Add ability to associate a LOCK_BUTTON device with a LOCK device
2. Send association via device shadow update

### TypeScript (ggp-func-ts-gocheckin)

1. **assets.models.ts**: Add `companionOf?: string` and `companions?: string[]` to Z2mLock, add `LockButtonEvent` interface
2. **function.conf**: Add `LOCK_BUTTON` to `ZB_CAT_WITH_KEYPAD`
3. **handler.ts**: Add `action` event routing (after line 79)
4. **assets.service.ts**: Add `handleButtonClickEvent()` method
5. **assets.service.ts**: Add `processCompanionAssociation()` for shadow-driven association
6. **assets.service.ts**: Update `processCamerasShadowDelta()` lock enrichment to check `companions`

### Python (ggp-func-py-gocheckin) — No Changes

py_handler already handles `trigger_detection` with `lock_asset_id`. The parent LOCK's assetId is sent, so context tracking, snapshot, and occupancy logic all work unchanged. The `withKeypad=true` enrichment ensures the P2 gate accepts the camera correctly.

## Verification

1. Pair GreenPower_2 → discovered as `LOCK_BUTTON` with `withKeypad=true`
2. Cloud associates button with MAG001AC → shadow update → local DB updated
3. MAG001AC's camera lock entry gets `withKeypad=true` (via companion check)
4. Press button → `{"action": "press_1"}` → `handleButtonClickEvent()` → resolves `companionOf` → parent lock's cameras → `trigger_detection` with parent's assetId
5. py_handler receives trigger, starts detection, timer expires naturally
6. Face match → `occupancyTriggeredLocks` contains parent LOCK's assetId → correct unlock target

## Files

| File | Repo | Action |
|------|------|--------|
| `packages/src/functions/assets/assets.models.ts` | ts | Add `companionOf`, `companions` to Z2mLock; add `LockButtonEvent` |
| `function.conf` | ts | Add LOCK_BUTTON to ZB_CAT_WITH_KEYPAD |
| `packages/src/handler.ts` | ts | Add `action` event routing |
| `packages/src/functions/assets/assets.service.ts` | ts | Add `handleButtonClickEvent()`, `processCompanionAssociation()`, update lock enrichment |
| Cloud API/UI | cloud | Association management (outside scope) |
| py_handler.py | py | No changes needed |
