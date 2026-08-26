import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminDashboardDto } from '@masalim/types';
import { Public } from '../../core/auth/auth.decorators';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AdminRoles } from './admin.decorators';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Public()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('dashboard')
  @AdminRoles('SUPPORT', 'OPERATIONS')
  @ApiOperation({ summary: 'Aggregate counts for the current operating day' })
  async stats(): Promise<AdminDashboardDto> {
    return this.dashboard.stats();
  }
}
