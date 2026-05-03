import { randomUUID } from 'crypto';
import { CITY_ID } from '@/config/city.config';
import { BaseMessage } from './message.types';

export const createBaseMessage = (type: string): BaseMessage => {
  const idpk = randomUUID();
  let msgId = randomUUID();
  while (msgId === idpk) {
    msgId = randomUUID();
  }

  return {
    idpk,
    msgId,
    type,
    timestamp: new Date().toISOString(),
    cityId: CITY_ID,
  };
};
