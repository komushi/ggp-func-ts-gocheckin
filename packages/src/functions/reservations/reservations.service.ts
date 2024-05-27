const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const STAGE = process.env.STAGE;

const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';

import { ClassicShadowReservations, ClassicShadowReservation } from './reservations.models';
import { ReservationsDao } from './reservations.dao';
import { MemberItem } from './reservations.models';
import { IotService } from '../iot/iot.service';

import axios from 'axios';

export class ReservationsService {

  private reservationsDao: ReservationsDao;
  private iotService: IotService;
  
  public constructor() {
    this.reservationsDao = new ReservationsDao();
    this.iotService = new IotService();
  }

  public async syncReservation(delta): Promise<any> {
    console.log('reservations.service syncReservation in: ' + JSON.stringify(delta));

    const getShadowResult = await this.iotService.getShadow({
        thingName: AWS_IOT_THING_NAME
    });

    const syncResults = await Promise.allSettled(
      Object.entries(getShadowResult.state.desired.reservations as ClassicShadowReservations).filter(([reservationCode]) => {
            return Object.keys(delta.state.reservations as ClassicShadowReservation).includes(reservationCode);
        }).map(async ([reservationCode, {listingId, lastRequestOn, action}]) => {
            if (action == ACTION_REMOVE) {
              const syncResult = await this.removeReservation({
                  reservationCode,
                  listingId,
                  lastRequestOn
              }).catch(err => {
                console.log('removeReservation err:' + JSON.stringify(err));
                return {
                  rejectReason: err.message
                }
              });

              await this.iotService.publish({
                topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_reset`,
                payload: JSON.stringify({
                    listingId: listingId,
                    reservationCode: reservationCode,
                    lastResponse: lastRequestOn,
                    rejectReason: syncResult.rejectReason,
                    clearRequest: (syncResult.rejectReason ? false : syncResult.clearRequest)
                })
              });

              if (syncResult.rejectReason) {
                throw new Error(syncResult.rejectReason); 
              }

              return;

            } else if (action == ACTION_UPDATE) {
              const syncResult = await this.addReservation({
                  reservationCode,
                  listingId,
                  lastRequestOn
              }).catch(err => {

                console.log('addReservation err:' + JSON.stringify(err));

                return {
                  rejectReason: err.message
                }
              });

              await this.iotService.publish({
                topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
                payload: JSON.stringify({
                  listingId: listingId,
                  reservationCode: reservationCode,
                  lastResponse: lastRequestOn,
                  rejectReason: syncResult.rejectReason
                })
              });

              if (syncResult.rejectReason) {
                throw new Error(syncResult.rejectReason); 
              }

              return;

            } else {
              await this.iotService.publish({
                  topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
                  payload: JSON.stringify({
                      listingId: listingId,
                      reservationCode: reservationCode,
                      lastResponse: lastRequestOn,
                      rejectReason: `Wrong action ${action}!`
                  })
              });

              throw new Error(`Wrong reservation action ${action}!`);
            }
    }));

    console.log('syncResults:' + JSON.stringify(syncResults));

    if (syncResults.every(syncResult => {
      return (syncResult.status == 'fulfilled')
    })) {
      await this.iotService.updateReportedShadow({
          thingName: AWS_IOT_THING_NAME,
          reportedState: getShadowResult.state.desired
      });     
    }

    console.log('reservations.service syncReservation out');

    return;
  }

  private async addReservation({reservationCode, listingId, lastRequestOn}: {reservationCode: string, listingId: string, lastRequestOn: string}): Promise<any> {

    console.log('reservations.service addReservation in: ' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

    const getShadowResult = await this.iotService.getShadow({
        thingName: AWS_IOT_THING_NAME,
        shadowName: reservationCode
    });

    if (!getShadowResult.state.desired ||
      !getShadowResult.state.desired.lastRequestOn ||
      getShadowResult.state.desired.lastRequestOn != lastRequestOn) {

      throw new Error('Request of SyncReservation datetime validation error!');
    }

    let reportedMembers = new Map();
    if (getShadowResult.state.reported) {
      if (getShadowResult.state.reported.members) {
        reportedMembers = new Map(Object.entries(getShadowResult.state.reported.members));  
      }
    }

    let desiredMembers = new Map();
    if (getShadowResult.state.desired) {
      if (getShadowResult.state.desired.members) {
        desiredMembers = new Map(Object.entries(getShadowResult.state.desired.members));  
      }
    }

    let toDeleteMembers = new Map();
    reportedMembers.forEach((value, key) => {
      if (!desiredMembers.has(key)) {
        toDeleteMembers.set(key, value);
      }
    });

    // delete local ddb members
    await this.reservationsDao.deleteMembers(Array.from(toDeleteMembers.values()));

    // delete local ddb reservation
    await this.reservationsDao.updateReservation(getShadowResult.state.desired.reservation);

    // get image and request embedding
    const updatedMemberPromises = [];
    desiredMembers.forEach((value, key) => {
      updatedMemberPromises.push(this.downloadImageAsBase64(value));
    });
    const updatedMemberResponses = (await Promise.all(updatedMemberPromises)).flatMap(x => x);

    // update local ddb members
    await this.reservationsDao.updateMembers(updatedMemberResponses);

    // update shadow
    const reportedState = Object.assign({}, getShadowResult.state.delta);

    toDeleteMembers.forEach((_, key) => {
      if (!reportedState['members']){
        reportedState['members'] ={};
      }
      reportedState['members'][key] = null;
    });

    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode,
      reportedState: reportedState
    });

    await Promise.allSettled(updatedMemberResponses.map(async (memberItem: MemberItem) => {
      delete memberItem.memberKeyItem;
      delete memberItem.faceImgKey;
      delete memberItem.faceImgUrl;
      delete memberItem.fullName;

      await this.iotService.publish({
        topic: `gocheckin/req_face_embeddings`,
        payload: JSON.stringify(memberItem)
      });
    }));

    console.log('reservations.service addReservation out:' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

    return {reservationCode, listingId, lastRequestOn};

  }

  private async removeReservation({reservationCode, listingId, lastRequestOn}: {reservationCode: string, listingId: string, lastRequestOn: string}): Promise<any> {

    console.log('reservations.service removeReservation in: ' + JSON.stringify({reservationCode, listingId, lastRequestOn}));

    const getShadowResult = await this.iotService.getShadow({
        thingName: AWS_IOT_THING_NAME,
        shadowName: reservationCode
    }).catch(err => {
      console.log('removeReservation getShadow err:' + JSON.stringify(err));
      return;
    });

    if (getShadowResult) {
      if (!getShadowResult.state.desired ||
        !getShadowResult.state.desired.lastRequestOn ||
        getShadowResult.state.desired.lastRequestOn != lastRequestOn) {

        throw new Error('Request of RemoveReservation datetime validation error!');
      }
    }

    // update local ddb
    await this.reservationsDao.deleteReservation({
      listingId: listingId,
      reservationCode: reservationCode
    });

    const memberItems: MemberItem[] = await this.reservationsDao.getMembers(reservationCode);
    await this.reservationsDao.deleteMembers(memberItems);

    await this.iotService.deleteShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode     
    }).catch(err => {
      console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
      return;
    });

    console.log('reservations.service removeReservation out:' + JSON.stringify({reservationCode, listingId, lastRequestOn, clearRequest: true}));

    return {reservationCode, listingId, lastRequestOn, clearRequest: true};
    
  }

  private async downloadImageAsBase64(memberItem: MemberItem): Promise<any> {

    console.log('reservations.service downloadImageAsBase64 in:' + JSON.stringify({memberItem}));

    try {
        // Download the image
        const response = await axios({
            url: memberItem.faceImgUrl,
            method: 'GET',
            responseType: 'arraybuffer',
        });

        // Convert the image data to a Buffer
        const imageBuffer = Buffer.from(response.data, 'binary');

        // Convert the Buffer to a Base64 encoded string
        memberItem.faceImgBase64 = imageBuffer.toString('base64');

        console.log('reservations.service downloadImageAsBase64 out:' + JSON.stringify({memberItem}));

        return memberItem;
    } catch (error) {
        console.error('Error downloading or processing the image:', error);
        throw error;
    }
  }
}