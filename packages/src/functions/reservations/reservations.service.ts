const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const STAGE = process.env.STAGE;

const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';

import { ClassicShadowReservations, ClassicShadowReservation } from './reservations.models';
import { ReservationsDao } from './reservations.dao';
import { MemberItem, NamedShadowReservation } from './reservations.models';
import { IotService } from '../iot/iot.service';

import axios, { AxiosResponse } from 'axios';

export class ReservationsService {

  private reservationsDao: ReservationsDao;
  private iotService: IotService;
  
  public constructor() {
    this.reservationsDao = new ReservationsDao();
    this.iotService = new IotService();
  }

  public async processShadow(deltaShadowReservations: ClassicShadowReservations, desiredShadowReservations: ClassicShadowReservations): Promise<any> {
    console.log('reservations.service processShadow in: ' + JSON.stringify({deltaShadowReservations, desiredShadowReservations}));

    const promises = Object.keys(deltaShadowReservations).map(async (reservationsCode: string) => {
      const classicShadowReservation: ClassicShadowReservation = desiredShadowReservations[reservationsCode];
      if (classicShadowReservation) {
        try {
          if (classicShadowReservation.action == ACTION_REMOVE) {
            await this.processShadowDeleted(classicShadowReservation, reservationsCode);
            
          } else if (classicShadowReservation.action == ACTION_UPDATE) {
            await this.processShadowDelta(classicShadowReservation, reservationsCode);
          }
  
        } catch (err) {
          return {reservationsCode, action: classicShadowReservation.action, message: err.message, stack: err.stack};
        } 

        return {reservationsCode, action: classicShadowReservation.action};
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('reservations.service processShadow results:' + JSON.stringify(results));

    console.log('reservations.service processShadow out');

  }

  private async processShadowDeleted(classicShadowReservation: ClassicShadowReservation, reservationCode: string): Promise<any> {
    console.log('reservations.service processShadowDeleted in: ' + JSON.stringify({classicShadowReservation, reservationCode}));

    const syncResult = await this.clearReservation(reservationCode, classicShadowReservation.listingId).catch(err => {
      console.log('reservations.service processShadowDeleted clearReservation err:' + JSON.stringify(err));
      return {
        rejectReason: err.message
      }
    });

    await this.iotService.publish({
      topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_reset`,
      payload: JSON.stringify({
        listingId: classicShadowReservation.listingId,
        reservationCode: reservationCode,
        lastResponse: classicShadowReservation.lastRequestOn,
        lastRequestOn: classicShadowReservation.lastRequestOn,
        rejectReason: syncResult.rejectReason,
        clearRequest: (syncResult.rejectReason ? false : syncResult.clearRequest)
      })
    });

    console.log('reservations.service processShadowDeleted out');

    return;
  }

  private async processShadowDelta(classicShadowReservation: ClassicShadowReservation, reservationCode: string): Promise<any> {
    console.log('reservations.service processShadowDelta in: ' + JSON.stringify({classicShadowReservation, reservationCode}));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode
    });

    const delta: NamedShadowReservation = getShadowResult.state.desired;

    if (classicShadowReservation.lastRequestOn != delta.lastRequestOn) {
      return;
    }

    const syncResult = await this.refreshReservation(delta).catch(err => {

      console.log('reservations.service processShadowDelta refreshReservation err:' + JSON.stringify(err));

      return {
        rejectReason: err.message
      }
    });

    await this.iotService.publish({
      topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
      payload: JSON.stringify({
        listingId: classicShadowReservation.listingId,
        reservationCode: reservationCode,
        lastResponse: classicShadowReservation.lastRequestOn,
        lastRequestOn: classicShadowReservation.lastRequestOn,
        rejectReason: syncResult.rejectReason
      })
    });

    // Update the named shadow
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode,
      reportedState: delta
    });

    console.log('reservations.service processShadowDelta out');

    return;
  }

  private async refreshReservation(delta: NamedShadowReservation): Promise<any> {

    console.log('reservations.service refreshReservation in: ' + JSON.stringify(delta));

    // delete local ddb members
    const memberItems: MemberItem[] = await this.reservationsDao.getMembers(delta.reservation.reservationCode, ['reservationCode', 'memberNo']);
    await this.reservationsDao.deleteMembers(memberItems);

    // update local ddb members
    await this.reservationsDao.updateMembers(Object.values(delta.members));

    // update local ddb reservation
    await this.reservationsDao.updateReservation(delta.reservation);

    const responsesEmbedding = await Promise.all(Array.from(Object.values(delta.members)).map(async (memberItem: MemberItem) => {
      console.warn('reservations.service before recognise:' + JSON.stringify({reservationCode: memberItem.reservationCode, memberNo: memberItem.memberNo}));
      const response: AxiosResponse<MemberItem> = await axios.post("http://localhost:7777/recognise", memberItem);
      const responseData: MemberItem = response.data;
      return responseData;
    }));

    // update local ddb members
    await this.reservationsDao.updateMembers(responsesEmbedding);

    console.log('reservations.service refreshReservation force scanner to call fetch_members');

    // force scanner to call fetch_members
    const responseFetchMembers = await Promise.allSettled([''].map(async () => {
      return await axios.post("http://localhost:7777/recognise");
    }));

    // console.log('reservations.service refreshReservation out' + JSON.stringify(responseFetchMembers));

    console.log('reservations.service refreshReservation out');

    return {};
  }

  private async clearReservation(reservationCode: string, listingId: string): Promise<any> {

    console.log('reservations.service clearReservation in: ' + JSON.stringify({reservationCode, listingId}));


    // delete local ddb reservation
    await this.reservationsDao.deleteReservation({
      listingId: listingId,
      reservationCode: reservationCode
    });

    // delete local db member
    const memberItems: MemberItem[] = await this.reservationsDao.getMembers(reservationCode, ['reservationCode', 'memberNo']);
    await this.reservationsDao.deleteMembers(memberItems);

    await this.iotService.deleteShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode     
    }).catch(err => {
      console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
      return;
    });

    // force scanner to call fetch_members
    await Promise.allSettled([''].map(async () => {
      await axios.post("http://localhost:7777/recognise");
    }));

    console.log('reservations.service clearReservation out');

    return { clearRequest: true };
    
  }
/*
  public async syncReservation(delta): Promise<any> {
    console.log('reservations.service syncReservation in: ' + JSON.stringify(delta));

    const getShadowResult = await this.iotService.getShadow({
        thingName: AWS_IOT_THING_NAME
    });

    // console.log('reservations.service syncReservation getShadowResult: ' + JSON.stringify(getShadowResult));

    if (!getShadowResult.state.desired.reservations) {
      console.log('reservations.service syncReservation out: no desired reservations');
      return;
    }

    if (!delta.state.reservations) {
      console.log('reservations.service syncReservation out: no delta reservations');
      return;
    }

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
              lastRequestOn: lastRequestOn,
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
              lastRequestOn: lastRequestOn,
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
              lastRequestOn: lastRequestOn,
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
        // reportedState: { reservations: getShadowResult.state.desired.reservations }
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
    console.warn('reservations.service desiredMembers1.length:' + desiredMembers.keys.length);

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

    // update local ddb members
    await this.reservationsDao.updateMembers(Array.from(desiredMembers.values()));

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

    console.warn('reservations.service desiredMembers2.length:' + desiredMembers.keys.length);

    const responsesEmbedding = await Promise.all(Array.from(desiredMembers.values()).map(async (memberItem: MemberItem) => {
      console.warn('reservations.service before recognise:' + JSON.stringify({reservationCode: memberItem.reservationCode, memberNo: memberItem.memberNo}));
      const response: AxiosResponse<MemberItem> = await axios.post("http://localhost:7777/recognise", memberItem);
      const responseData: MemberItem = response.data;
      return responseData;
    }));

    console.log('reservations.service responsesEmbedding.length:' + responsesEmbedding.length);

    await this.reservationsDao.updateMembers(responsesEmbedding);

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

    const memberItems: MemberItem[] = await this.reservationsDao.getMembers(reservationCode, ['reservationCode', 'memberNo']);
    await this.reservationsDao.deleteMembers(memberItems);

    await this.iotService.deleteShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: reservationCode     
    }).catch(err => {
      console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
      return;
    });

    // force scanner to call fetch_members
    const responsesEmbedding = await Promise.allSettled([''].map(async () => {
      await axios.post("http://localhost:7777/recognise");
    }));

    // console.log('reservations.service removeReservation responsesEmbedding:' + JSON.stringify(responsesEmbedding));

    console.log('reservations.service removeReservation out:' + JSON.stringify({reservationCode, listingId, lastRequestOn, clearRequest: true}));

    return {reservationCode, listingId, lastRequestOn, clearRequest: true};
    
  }
*/

  /* embedding request from mqtt disabled
  public async refreshMember(memberItem: MemberItem): Promise<any> {
    console.log('reservations.service refreshMember in: ' + JSON.stringify(memberItem));
    
    const crtMemberItem = await this.reservationsDao.getMember(memberItem.reservationCode, memberItem.memberNo);
    crtMemberItem.faceEmbedding = memberItem.faceEmbedding;

    await this.reservationsDao.updateMembers([crtMemberItem]);

    console.log('reservations.service refreshMember out');
  }
  */
}