import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminModerationDecisionSchema,
  adminModerationQueueSchema,
  type AdminModerationDecisionInput,
  type AdminModerationQueueInput,
} from '@masalim/validation';
import type {
  AdminModerationRecordDto,
  AdminModerationSubjectDto,
  Paginated,
} from '@masalim/types';
import { zodBody, zodQuery } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminCaller, AdminRoles, type AdminCallContext } from './admin.decorators';
import { AdminModerationService } from './admin-moderation.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Public()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles('SUPPORT')
@Controller('admin')
export class AdminModerationController {
  constructor(private readonly moderation: AdminModerationService) {}

  @Get('moderation/queue')
  @ApiOperation({ summary: 'Records still waiting on a human decision' })
  async queue(
    @Query(zodQuery(adminModerationQueueSchema)) query: AdminModerationQueueInput,
  ): Promise<Paginated<AdminModerationRecordDto>> {
    return this.moderation.queue(query);
  }

  @Get('moderation/:id')
  @ApiOperation({ summary: 'One moderation record, whether or not it has been reviewed' })
  async findOne(@Param('id') recordId: string): Promise<AdminModerationRecordDto> {
    return this.moderation.findOne(recordId);
  }

  @Get('moderation/:id/subject')
  @ApiOperation({ summary: 'The content behind a queued record; this read is audited' })
  async subject(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') recordId: string,
  ): Promise<AdminModerationSubjectDto> {
    return this.moderation.subject(caller, recordId);
  }

  @Post('moderation/:id/decision')
  @ApiOperation({ summary: 'Approve or reject a queued record' })
  async decide(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') recordId: string,
    @Body(zodBody(adminModerationDecisionSchema)) body: AdminModerationDecisionInput,
  ): Promise<AdminModerationRecordDto> {
    return this.moderation.decide(caller, recordId, body);
  }
}
