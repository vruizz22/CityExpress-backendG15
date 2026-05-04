import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'CityExpress G15 (TK3) API Running!';
  }
}
