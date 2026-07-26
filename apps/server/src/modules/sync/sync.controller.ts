import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { SyncBootstrapQueryDto } from './dto/sync-bootstrap-query.dto';
import { SyncChangesQueryDto } from './dto/sync-changes-query.dto';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(UserApiSessionGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('bootstrap')
  bootstrap(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncBootstrapQueryDto,
  ) {
    return this.syncService.bootstrap(user, query);
  }

  @Get('changes')
  changes(@CurrentUser() user: AuthenticatedUser, @Query() query: SyncChangesQueryDto) {
    return this.syncService.changes(user, query);
  }
}
