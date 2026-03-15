export interface ListingSpaces {
    hostId: string;
    listingId: string;
    spaces: Space[];        // Array of space objects from listing
    lastUpdateOn: string;
}

export interface ClassicShadowListing {
    action: string;
    lastRequestOn: string;
}

export interface ClassicShadowListings {
    [shadowName: string]: ClassicShadowListing;  // shadowName = "listing:<listingId>"
}

export interface Space {
    uuid: string;
    assetName: string;
    category: string;
}