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
    // En minúscula: el broker rutea por `city.<code>` (binding `city.tk3`) y las
    // routing keys son case-sensitive. Si la central/peers responden usando
    // nuestro `cityId` como destino, en mayúscula ("TK3") la respuesta se
    // perdería. Nuestras comparaciones internas usan `sameCity` (case-insensitive).
    cityId: CITY_ID.toLowerCase(),
  };
};
