export interface ClassicShadowReservation {
    listingId: string;
    lastRequestOn: string;
    action: string;
}

export interface ClassicShadowReservations {
    [reservationCode: string]: ClassicShadowReservation;
};

export interface NamedShadowReservation {
    reservation: ReservationItem;
    members: MemberItemList;
    lastRequestOn: string;
};

export interface MemberItemList {
    [memberItemKey: string]: MemberItem;
};

export interface MemberItem {
    reservationCode: string;
    memberNo: number;
    faceImgKey: string;
    fullName: string;
    faceImgUrl: string;
    faceImgBase64: string
    faceEmbedding: number[];
}

export interface ReservationItem {
    reservationCode: string;
    memberCount: number;
    listingId: string;
    checkInDate: string;
    checkOutDate: string;
}
