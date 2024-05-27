import { PropertyItem } from './assets.models';
import { AssetsDao } from './assets.dao';

export class AssetsService {

  private assetsDao: AssetsDao;
  
  public constructor() {
    this.assetsDao = new AssetsDao();
  }

  public async intializeProperty(hostId: string, property: PropertyItem): Promise<any> {
    console.log('assets.service intializeProperty in' + JSON.stringify({hostId, property}));

    await this.assetsDao.deleteProperties(hostId);

    await this.assetsDao.createProperty(hostId, property);

    console.log('assets.service intializeProperty out');

    return;
  }

  public async getProperty(hostId: string): Promise<any> {
    console.log('assets.service getProperty in' + JSON.stringify({hostId}));

    const propertyItem: PropertyItem = await this.assetsDao.getProperty(hostId);

    console.log('assets.service getProperty out' + JSON.stringify({propertyItem}));

    return propertyItem;
  }

}