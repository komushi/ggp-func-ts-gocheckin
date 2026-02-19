# Design Change History — Lock & Detection System

This document traces the evolution of the lock-triggered detection system across `ggp-func-ts-gocheckin`.

## Phase 1: Bidirectional Lock-Camera Reference

**Doc**: [bidirectional_lock_camera.md](./bidirectional_lock_camera.md)

**Problem**: Lock occupancy events required scanning all cameras to find associated locks — O(n) per event.

**Change**: Added `Z2mLock.cameras` field for reverse lookup. When camera shadow is updated, `syncLockCameraReference()` maintains the Lock → Camera direction. Camera → Lock already existed from cloud shadow.

**Result**: O(1) camera lookup from lock occupancy events.

## Phase 2: Lock Occupancy Handler

**Doc**: [lock_occupancy_handler.md](./lock_occupancy_handler.md)

**Problem**: No mechanism to trigger face detection from lock sensor events. ONVIF motion was the only trigger.

**Change**: `handler.ts` routes `zigbee2mqtt/{device}` events with `occupancy` attribute to `handleLockTouchEvent()` (true) and `handleLockStopEvent()` (false). These publish `gocheckin/trigger_detection` and `gocheckin/stop_detection` with `lock_asset_id` to the Python component.

**Selective unlock**: `unlockByMemberDetected()` uses `occupancyTriggeredLocks` to unlock specific locks, `onvifTriggered` for legacy locks.

**Result**: Lock sensors trigger targeted face detection and selective unlock.

## Phase 3: Lock Toggle Simplification

**Doc**: [lock_state_sync.md](./lock_state_sync.md)

**Problem**: `unlockZbLock()` tracked lock state in DynamoDB, causing state drift when locks were controlled externally.

**Change**: Replaced `ON`/`OFF` state tracking with `TOGGLE` command. Removed DynamoDB state writes.

**Result**: Simpler code, no state drift, fewer DB operations.

## Phase 4: LOCK_BUTTON Companion Association

**Doc**: [LOCK_BUTTON_ASSOCIATION.md](./LOCK_BUTTON_ASSOCIATION.md)

**Depends on**: Phase 1 (bidirectional references), Phase 2 (occupancy handler)

**Problem**: MAG001AC locks have no occupancy sensor. With the py_handler Phase 0A refactor, P2 cameras (cameras with locks) reject ONVIF triggers. These locks need GreenPower_2 buttons as trigger sources. Two button types are needed:
- **Entry button** (outside): triggers face detection before unlock
- **Exit button** (inside): unlocks directly without detection

**Change**:
- Cloud shadow adds `entryButtons` and `exitButtons` arrays to camera lock entries
- `processCamerasShadowDelta()` enrichment: `withKeypad = lockRecord.withKeypad || entryButtons.length > 0`
- `Z2mLock` gets `companionOf` (parent lock ID) and `buttonType` (`ENTRY` or `EXIT`)
- `handler.ts` routes `action` events to `handleButtonClickEvent()`, which:
  - Entry button → `trigger_detection` with parent lock's assetId
  - Exit button → `unlockZbLock()` directly (no detection)

**py_handler contract**: Always receives `{ cam_ip, lock_asset_id }` — no knowledge of buttons, button types, or device categories.

**Result**: MAG001AC + GreenPower_2 entry button works identically to KEYPAD_LOCK. Exit button provides direct unlock for inside/exit use. No py_handler changes needed.

## Data Model Evolution

```
Phase 1:  Z2mLock += cameras: { [cameraAssetId]: { assetId, localIp } }
Phase 2:  GoCheckInLock += category
          MemberDetectedItem += onvifTriggered, occupancyTriggeredLocks
          + LockOccupancyEvent interface
Phase 3:  unlockZbLock() uses TOGGLE (Z2mLock.state deprecated)
Phase 4:  GoCheckInLock += companions: string[]
          Z2mLock += companionOf?: string, companions?: string[]
          + LockButtonEvent interface
          MemberDetectedItem: onvifTriggered removed (py_handler Phase 0A)
```

## Shadow Evolution

```json
// Phase 1-3: Camera named shadow lock entry
"locks": {
    "0xe4b323fffeb4b614": {
        "assetName": "MAG002"
    }
}

// Phase 4: + companions
"locks": {
    "0xe4b323fffeb4b614": {
        "assetName": "MAG002",
        "companions": ["0x00_greenpower_button_1"]
    }
}
```
