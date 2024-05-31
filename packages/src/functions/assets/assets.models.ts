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
    category: string;
    ip: string;
    username: string;
    password: string;
    rtsp: RTSP;
    onvif: ONVIF;
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
    roomCode: string;
    lastUpdateOn: string;
}

interface RTSP {
    port: number;
    path: string;
}

interface ONVIF {
    port: number;
}