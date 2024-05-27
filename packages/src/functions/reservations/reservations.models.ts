export interface ClassicShadowReservation {
    listingId: string;
    lastRequestOn: string;
    action: string;
}

export interface ClassicShadowReservations {
    [reservationCode: string]: ClassicShadowReservation;
};

export interface MemberKeyItem {
    roomCode: string;
    keyInfo: string;
    equipmentId: string;
}

export interface MemberItem {
    reservationCode: string;
    memberNo: number;
    faceImgKey: string;
    fullName: string;
    memberKeyItem: MemberKeyItem;
    faceImgUrl: string;
    faceImgBase64: string
    faceEmbedding: string;
}

export interface ReservationItem {
    reservationCode: string;
    memberCount: number;
    listingId: string;
    checkInDate: string;
    checkOutDate: string;
}
