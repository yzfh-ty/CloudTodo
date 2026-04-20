import { Module } from '@nestjs/common';
import { WebhookTestController } from './webhook-test.controller';

@Module({
  controllers: [WebhookTestController],
})
export class WebhookTestModule {}
