import { Global, Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { OutboundHttpService } from './outbound-http.service';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [CsrfService, OutboundHttpService, RateLimitService],
  exports: [CsrfService, OutboundHttpService, RateLimitService],
})
export class SecurityModule {}
