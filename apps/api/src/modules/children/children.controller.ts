import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createChildSchema,
  updateChildSchema,
  type CreateChildInput,
  type UpdateChildInput,
} from '@masalim/validation';
import type { ChildDto, InterestDto } from '@masalim/types';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { ChildrenService } from './children.service';

@ApiTags('children')
@Controller()
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

  @Get('interests')
  @ApiOperation({ summary: 'Interest catalogue for the child profile chips' })
  async listInterests(): Promise<InterestDto[]> {
    return this.children.listInterests();
  }

  @Get('children')
  @ApiOperation({ summary: 'Children belonging to the signed-in parent' })
  async list(@CurrentUserId() userId: string): Promise<ChildDto[]> {
    return this.children.list(userId);
  }

  @Post('children')
  @ApiOperation({ summary: 'Add a child profile' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(createChildSchema)) body: CreateChildInput,
  ): Promise<ChildDto> {
    return this.children.create(userId, body);
  }

  @Get('children/:id')
  @ApiOperation({ summary: 'A single child profile' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') childId: string,
  ): Promise<ChildDto> {
    return this.children.findOne(userId, childId);
  }

  @Patch('children/:id')
  @ApiOperation({ summary: 'Update a child profile' })
  async update(
    @CurrentUserId() userId: string,
    @Param('id') childId: string,
    @Body(zodBody(updateChildSchema)) body: UpdateChildInput,
  ): Promise<ChildDto> {
    return this.children.update(userId, childId, body);
  }

  @Delete('children/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a child profile; their stories are kept' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') childId: string,
  ): Promise<void> {
    await this.children.remove(userId, childId);
  }
}
