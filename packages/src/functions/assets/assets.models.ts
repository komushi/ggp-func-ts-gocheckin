export interface PropertyItem {
    hostId: string;
    uuid: string;
    hostPropertyCode: string;
    propertyCode: string;
    category: string;
}

export interface NamedShadowCamera {
    hostId: string;
    uuid: string;
    propertyCode: string;
    hostPropertyCode: string;
    category: string;
    coreName: string;
    equipmentId: string;
    equipmentName: string;
    localIp: string;
    username: string;
    password: string;
    rtsp: RTSP;
    onvif: ONVIF;
    isRecording: boolean;
    isDetecting: boolean;
    lastUpdateOn: string;
}

export interface ClassicShadowCamera {
    hostId: string;
    uuid: string;
    active: boolean;
};

export interface ClassicShadowCameras {
    [uuid: string]: ClassicShadowCamera;
};

export interface ScannerItem {
    uuid: string;
    hostId: string;
    propertyCode: string;
    hostPropertyCode: string;
    category: string;
    equipmentId: string;
    equipmentName: string;
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
};
  
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
    hostPropertyCode: string;
    propertyCode: string
    equipmentName: string;
    equipmentId: string;
    withKeypad: boolean;
    category: string;
    coreName: string;
    lastUpdateOn: string;
}