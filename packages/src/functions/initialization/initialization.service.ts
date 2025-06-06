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

	public async intializeEnvVar(): Promise<any> {

		console.log('initialization.service intializeEnvVar in');
		let errName: string = '';
		let errMessage: string = '';

		try {
			if (!process.env.HOST_ID || !process.env.STAGE || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST) {
				const result = await this.assetsService.getHost();
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
		} catch (err) {
			errName = err.name;
			errMessage = err.message;

			console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
			console.error('err.name:' + err.name);
			console.error('err.message:' + err.message);
			console.error('err.stack:' + err.stack);
			console.trace();
			console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
		} finally {
			if (errName.includes('ResourceNotFoundException')) {
				await this.createTables().catch(err => {
					console.error('!!!!!!error happened at intializeEnvVar createTables!!!!!!');
					console.error('err.name:' + err.name);
					console.error('err.message:' + err.message);
					console.error('err.stack:' + err.stack);
					console.trace();
				});
			}
		}

		console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
		console.log('after intializeEnvVar IDENTTITY_ID:' + process.env.IDENTTITY_ID);
		console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
		console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);
		console.log('after intializeEnvVar CRED_PROVIDER_HOST:' + process.env.CRED_PROVIDER_HOST);

		console.log('initialization.service intializeEnvVar out');

		return;
	}
}