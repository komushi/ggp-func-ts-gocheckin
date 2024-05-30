import { PropertyItem, CameraItem } from './assets.models';
import { AssetsDao } from './assets.dao';

import ShortUniqueId from 'short-unique-id';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  
  public constructor() {
    this.assetsDao = new AssetsDao();

    this.uid = new ShortUniqueId();
  }

  public async intializeProperty(hostId: string, propertyItem: PropertyItem): Promise<any> {
    console.log('assets.service intializeProperty in' + JSON.stringify({hostId, propertyItem}));

    await this.assetsDao.deleteProperties(hostId);

    propertyItem.hostId = hostId;
    propertyItem.hostPropertyCode = `${hostId}-${propertyItem.propertyCode}`;
    propertyItem.category = 'PROPERTY';

    await this.assetsDao.createProperty(propertyItem);

    console.log('assets.service intializeProperty out');

    return;
  }

  public async intializeCameras(hostId: string, cameraItems: CameraItem[]): Promise<any> {
    console.log('assets.service intializeProperty in' + JSON.stringify({hostId, cameraItems}));

    await this.assetsDao.deleteCameras(hostId);

    await Promise.all(cameraItems.map(async (cameraItem: CameraItem) => {
      cameraItem.hostId = hostId;
      cameraItem.uuid = this.uid.randomUUID(6);
      cameraItem.category = 'CAMERA';

      await this.assetsDao.createCamera(cameraItem);
    }));

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