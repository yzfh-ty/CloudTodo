import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      code: 'OK',
      message: 'success',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
