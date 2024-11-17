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
