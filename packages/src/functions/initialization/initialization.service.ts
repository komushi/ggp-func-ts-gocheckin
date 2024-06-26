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


  	public async saveHost({hostId, identityId, stage, credProviderHost}: {hostId: string, identityId: string, stage: string, credProviderHost: string}): Promise<any> {

    	console.log('initialization.service saveHost in:' + JSON.stringify({hostId, identityId, stage, credProviderHost}));

    	await this.initializationDao.updateHost({hostId, identityId, stage, credProviderHost});

    	console.log('initialization.service saveHost out');

    	return;
	}

  	public async intializeEnvVar(): Promise<any> {

    	console.log('initialization.service intializeEnvVar in');

	    if (!process.env.HOST_ID || !process.env.STAGE || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST) {
	        const result = await this.initializationDao.getHost();
	        process.env.HOST_ID = result.hostId;
	        process.env.STAGE = result.stage;
			process.env.IDENTTITY_ID = result.identityId;
			process.env.CRED_PROVIDER_HOST = result.credProviderHost;
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