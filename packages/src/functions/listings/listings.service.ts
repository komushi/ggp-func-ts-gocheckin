const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;

const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';

import { ListingsDao } from './listings.dao';
import { IotService } from '../iot/iot.service';
import { ClassicShadowListings, ClassicShadowListing, ListingSpaces } from './listings.models';

export class ListingsService {
  private listingsDao: ListingsDao;
  private iotService: IotService;

  public constructor() {
    this.listingsDao = new ListingsDao();
    this.iotService = new IotService();
  }

  /**
   * Process listing shadow delta - syncs spaces mappings for listings
   */
  public async processListingsShadow(
    deltaShadowListings: ClassicShadowListings,
    desiredShadowListings: ClassicShadowListings
  ): Promise<any> {
    console.log('listings.service processListingsShadow in: ' + JSON.stringify({ deltaShadowListings, desiredShadowListings }));

    const promises = Object.keys(desiredShadowListings).map(async (shadowName: string) => {
      const classicShadowListing: ClassicShadowListing = desiredShadowListings[shadowName];
      if (classicShadowListing) {
        try {
          if (classicShadowListing.action === ACTION_REMOVE) {
            await this.processShadowDeleted(classicShadowListing, shadowName);
          } else if (classicShadowListing.action === ACTION_UPDATE) {
            await this.processShadowDelta(classicShadowListing, shadowName);
          }
        } catch (err) {
          return { shadowName, action: classicShadowListing.action, message: err.message, stack: err.stack };
        }

        return { shadowName, action: classicShadowListing.action };
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('listings.service processListingsShadow results:' + JSON.stringify(results));
    console.log('listings.service processListingsShadow out');
  }

  private async processShadowDeleted(classicShadowListing: ClassicShadowListing, shadowName: string): Promise<any> {
    console.log('listings.service processShadowDeleted in: ' + JSON.stringify({ classicShadowListing, shadowName }));

    const listingId = shadowName.replace('listing:', '');

    const syncResult = await this.listingsDao.deleteListingSpaces(
      process.env.HOST_ID,
      listingId
    ).catch(err => {
      console.log('listings.service processShadowDeleted deleteListingSpaces err:' + JSON.stringify(err));
      return { rejectReason: err.message };
    });

    await this.iotService.publish({
      topic: `gocheckin/${AWS_IOT_THING_NAME}/listing_reset`,
      payload: JSON.stringify({
        listingId,
        lastResponse: classicShadowListing.lastRequestOn,
        lastRequestOn: classicShadowListing.lastRequestOn,
        rejectReason: syncResult.rejectReason,
        clearRequest: (syncResult.rejectReason ? false : true)
      })
    });

    console.log('listings.service processShadowDeleted out');
  }

  private async processShadowDelta(classicShadowListing: ClassicShadowListing, shadowName: string): Promise<any> {
    console.log('listings.service processShadowDelta in: ' + JSON.stringify({ classicShadowListing, shadowName }));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: shadowName
    });

    const delta = getShadowResult.state.desired;

    if (!delta || !delta.lastRequestOn || !classicShadowListing.lastRequestOn) {
      console.log('listings.service processShadowDelta missing lastRequestOn, skipping');
      return;
    }

    if (classicShadowListing.lastRequestOn === delta.lastRequestOn) {
      return;
    }

    // upsert local ddb listing
    const listingId = delta.listingId || shadowName.replace('listing:', '');
    await this.listingsDao.upsertListingSpaces({
      hostId: process.env.HOST_ID,
      listingId: listingId,
      spaces: delta.spaces,
      lastUpdateOn: delta.lastRequestOn
    } as ListingSpaces);

    // Update the named shadow reported state
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: shadowName,
      reportedState: delta
    });

    await this.iotService.publish({
      topic: `gocheckin/${AWS_IOT_THING_NAME}/listing_deployed`,
      payload: JSON.stringify({
        listingId,
        lastResponse: classicShadowListing.lastRequestOn,
        lastRequestOn: classicShadowListing.lastRequestOn
      })
    });

    console.log('listings.service processShadowDelta out');
  }
}
