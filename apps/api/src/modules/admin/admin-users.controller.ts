import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { adminUserSearchSchema, type AdminUserSearchInput } from '@masalim/validation';
import type {
  AdminDeletionRequestDto,
  AdminUserDetailDto,
  AdminUserSummaryDto,
  Paginated,
} from '@masalim/types';
import { zodQuery } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminCaller, AdminRoles, type AdminCallContext } from './admin.decorators';
import { AdminUsersService } from './admin-users.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Public()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles('SUPPORT')
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'Find an account by email or id' })
  async search(
    @Query(zodQuery(adminUserSearchSchema)) query: AdminUserSearchInput,
  ): Promise<Paginated<AdminUserSummaryDto>> {
    return this.users.search(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'One account in counts; this read is audited' })
  async findOne(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') userId: string,
  ): Promise<AdminUserDetailDto> {
    return this.users.findOne(caller, userId);
  }

  @Get('users/:id/deletion-requests')
  @ApiOperation({ summary: 'Deletion requests for an account; this read is audited' })
  async deletionRequests(
    @AdminCaller() caller: AdminCallContext,
    @Param('id') userId: string,
  ): Promise<AdminDeletionRequestDto[]> {
    return this.users.deletionRequests(caller, userId);
  }
}
