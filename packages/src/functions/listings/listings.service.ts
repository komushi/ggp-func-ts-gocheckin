const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;

import { ListingsDao } from './listings.dao';
import { IotService } from '../iot/iot.service';
import { ClassicShadowListings } from './listings.models';

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
      const listingId = shadowName.replace('listing:', '');

      const getShadowResult = await this.iotService.getShadow({
        thingName: AWS_IOT_THING_NAME,
        shadowName: shadowName
      });

      const delta = getShadowResult.state.desired;

      if (delta && delta.spaces) {
        await this.listingsDao.upsertListingSpaces({
          hostId: process.env.HOST_ID,
          listingId: delta.listingId || listingId,
          spaces: delta.spaces,
          lastUpdateOn: delta.lastRequestOn
        });
      }
    });

    await Promise.all(promises);
    console.log('listings.service processListingsShadow out');
  }
}