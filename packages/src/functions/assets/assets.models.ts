export interface PropertyItem {
    hostId: string;
    uuid: string;
    hostPropertyCode: string;
    propertyCode: string;
    category: string;
}

export interface CameraItem {
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
    lastUpdateOn: string;
}

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
}