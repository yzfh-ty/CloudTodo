import { Body, Controller, Post } from '@nestjs/common';

@Controller('webhook-test')
export class WebhookTestController {
  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return {
      code: 'OK',
      message: 'success',
      data: {
        received: true,
        body,
        received_at: new Date().toISOString(),
      },
    };
  }
}
