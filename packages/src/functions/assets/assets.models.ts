export interface Space {
    hostId: string;
    uuid: string;
    propertyCode: string;
    hostPropertyCode: string;
    coreName: string;
    assetName: string;
    category: string;
    layoutId: number;
}


export interface PropertyItem {
    hostId: string;
    uuid: string;
    propertyCode: string;
    hostPropertyCode: string;
    category: string;
}

export interface NamedShadowCamera {
    hostId: string;
    uuid: string;
    propertyCode: string;
    hostPropertyCode: string;
    category: string;
    coreName: string;
    assetId: string;
    assetName: string;
    localIp: string;
    username: string;
    password: string;
    rtsp: RTSP;
    onvif: ONVIF;
    locks: GoCheckInLocks;
    isRecording: boolean;
    isDetecting: boolean;
    inSpaces: string[];
    layoutId: number;
    position: number;
    lastUpdateOn: string;
}

export interface GoCheckInLock {
    assetId: string;
    assetName: string;
    withKeypad: boolean;
}

export interface GoCheckInLocks {
    [assetId: string]: GoCheckInLock;
}

export interface ClassicShadowSpace {
    action: string;
    lastRequestOn: string;
}

export interface ClassicShadowSpaces {
    [uuid: string]: ClassicShadowSpace;
}

export interface ClassicShadowCamera {
    action: string;
    lastRequestOn: string;
}

export interface ClassicShadowCameras {
    [uuid: string]: ClassicShadowCamera;
}

export interface ScannerItem {
    uuid: string;
    hostId: string;
    propertyCode: string;
    hostPropertyCode: string;
    category: string;
    assetId: string;
    assetName: string;
    coreName: string;
    localIp: string;
    longitude: string;
    latitude: string;
    lastUpdateOn: string;
}

interface RTSP {
    port: number;
    path: string;
    codec: string;
    framerate: number;
}

interface ONVIF {
    port: number;
    isSubscription: boolean;
    isPullpoint: boolean;
}

// Single Inference Type (Broad, Flattened)
export interface Z2mEvent {
    data: {
        definition?: DeviceDefinition;
        friendly_name: string;
        ieee_address: string;
        status: string;
        supported?: boolean;
    };
    type: string;
}

// Hierarchical Interfaces (More Granular)
interface DeviceDefinition {
    description: string;
    exposes: DeviceExpose[];
    model: string;
    options: DeviceOption[];
    supports_ota: boolean;
    vendor: string;
}

interface DeviceExpose {
    type: string;
    access?: number;
    category?: string;
    description?: string;
    label?: string;
    name?: string;
    property?: string;
    features?: DeviceFeature[];
    unit?: string;
    value_max?: number;
    value_min?: number;
}

interface DeviceFeature {
    access: number;
    description: string;
    label: string;
    name: string;
    property: string;
    type: string;
    value_off: string | boolean;
    value_on: string | boolean;
    value_toggle?: string;
}

interface DeviceOption {
    access: number;
    description: string;
    label: string;
    name: string;
    property: string;
    type: string;
    value_off: boolean;
    value_on: boolean;
}

export interface Z2mRenamed {
    data: {
        from: string;
        homeassistant_rename: boolean;
        to: string;
    };
    status: string;
    transaction: string;
};

export interface Z2mRemoved {
    data: {
        block: boolean;
        force: boolean;
        id: string;
    };
    status: string;
    transaction: string;
};

export interface Z2mDevice {
    friendlyName: string;
    description: string;
    ieeeAddress: string;
    vendor: string;
    model: string;
}

export interface Z2mLock {
    hostId: string;
    uuid: string;
    propertyCode: string
    hostPropertyCode: string;
    coreName: string;
    assetName: string;
    assetId: string;
    roomCode?: string;
    withKeypad: boolean;
    category: string;
    vendor: string;
    model: string;
    state: boolean;
    lastUpdateOn: string;
    cameras?: Z2mLockCameras;
}

export interface Z2mLockCamera {
    assetId: string;
    localIp: string;
}

export interface Z2mLockCameras {
    [assetId: string]: Z2mLockCamera;
}

export interface MemberDetectedItem {
    hostId: string;
    propertyCode: string;
    hostPropertyCode: string;
    coreName: string;
    assetId: string;
    assetName: string;
    cameraIp: string;
    reservationCode: string;
    listingId: string;
    memberNo: number;
    fullName: string;
    similarity: number;
    recordTime: string;
    checkInImgKey: string;
    propertyImgKey: string;
}