import { Global, Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { OutboundHttpService } from './outbound-http.service';
import { RateLimitService } from './rate-limit.service';
import { SecurityAuditService } from './security-audit.service';
import { SecurityRequestContextService } from './security-request-context.service';

@Global()
@Module({
  providers: [
    CsrfService,
    OutboundHttpService,
    RateLimitService,
    SecurityAuditService,
    SecurityRequestContextService,
  ],
  exports: [
    CsrfService,
    OutboundHttpService,
    RateLimitService,
    SecurityAuditService,
    SecurityRequestContextService,
  ],
})
export class SecurityModule {}
