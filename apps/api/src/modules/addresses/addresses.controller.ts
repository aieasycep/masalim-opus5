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
  addressSchema,
  updateAddressSchema,
  type AddressInput,
  type UpdateAddressInput,
} from '@masalim/validation';
import type { AddressDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { AddressesService } from './addresses.service';

@ApiTags('addresses')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Saved delivery addresses' })
  async list(@CurrentUserId() userId: string): Promise<AddressDto[]> {
    return this.addresses.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Save a delivery address' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(addressSchema)) body: AddressInput,
  ): Promise<AddressDto> {
    return this.addresses.create(userId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a delivery address' })
  async update(
    @CurrentUserId() userId: string,
    @Param('id') addressId: string,
    @Body(zodBody(updateAddressSchema)) body: UpdateAddressInput,
  ): Promise<AddressDto> {
    return this.addresses.update(userId, addressId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a delivery address' })
  async remove(
    @CurrentUserId() userId: string,
    @Param('id') addressId: string,
  ): Promise<void> {
    await this.addresses.remove(userId, addressId);
  }
}
