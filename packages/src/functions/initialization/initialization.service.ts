import { InitializationDao } from './initialization.dao';
import { AssetsService } from '../assets/assets.service';

export class InitializationService {

	private initializationDao: InitializationDao;
	private assetsService: AssetsService;
	
	public constructor() {
		this.initializationDao = new InitializationDao();
		this.assetsService = new AssetsService();
	}

	public async createTables(): Promise<any> {
		console.log(`initialization.service createTables in`);

		await this.initializationDao.createTables();

		console.log(`initialization.service createTables out`);

		return;
	}


  	public async saveHost({hostId, stage}: {hostId: string, stage: string}): Promise<any> {

    	console.log('initialization.service saveHost in:' + JSON.stringify({hostId, stage}));

    	await this.initializationDao.updateHost({hostId, stage});

    	console.log('initialization.service saveHost out');

    	return;
	}

  	public async intializeEnvVar(): Promise<any> {

    	console.log('initialization.service intializeEnvVar in');

	    if (!process.env.HOST_ID || !process.env.STAGE) {
	        const result = await this.initializationDao.getHost();
	        process.env.HOST_ID = result.hostId;
	        process.env.STAGE = result.stage;
	    }

	    if (!process.env.PROPERTY_CODE) {
	        if (process.env.HOST_ID) {
	            const property = await this.assetsService.getProperty(process.env.HOST_ID);
	            if (property) {
	            	process.env.PROPERTY_CODE = property.propertyCode;
	            	console.log('initialization.service intializeEnvVar Property UUID: ' + property.uuid);
	            }
	        }
	    }

    	console.log('initialization.service intializeEnvVar out');

    	return;
	}
}