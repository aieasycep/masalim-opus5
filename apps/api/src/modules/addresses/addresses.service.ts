import { Injectable } from '@nestjs/common';
import type { AddressDto } from '@masalim/types';
import type { AddressInput, UpdateAddressInput } from '@masalim/validation';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PolicyService } from '../../core/policy/policy.service';
import { Clock } from '../../core/time/clock';

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<AddressDto[]> {
    const addresses = await this.prisma.client.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map((address) => this.toDto(address));
  }

  async create(userId: string, input: AddressInput): Promise<AddressDto> {
    const existing = await this.prisma.client.address.count({ where: { userId } });
    // The first address a parent saves is their default whether they ticked the
    // box or not — otherwise checkout has nothing preselected.
    const isDefault = input.isDefault || existing === 0;

    const address = await this.prisma.client.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          fullName: input.fullName,
          phone: input.phone,
          line1: input.line1,
          ...(input.line2 ? { line2: input.line2 } : {}),
          district: input.district,
          city: input.city,
          postalCode: input.postalCode,
          countryCode: input.countryCode,
          isDefault,
        },
      });
    });

    return this.toDto(address);
  }

  async update(
    userId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressDto> {
    await this.policy.assertAddress(userId, addressId);

    const address = await this.prisma.client.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
          ...(input.line2 !== undefined ? { line2: input.line2 } : {}),
          ...(input.district !== undefined ? { district: input.district } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
      });
    });

    return this.toDto(address);
  }

  /**
   * Removes an address.
   *
   * Soft delete, because orders reference it. The snapshot on the order is what
   * a parcel is actually shipped to, so an order already placed is unaffected —
   * but the row still has to survive for the history to make sense.
   */
  async remove(userId: string, addressId: string): Promise<void> {
    const address = await this.policy.assertAddress(userId, addressId);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: addressId },
        data: { deletedAt: this.clock.now(), isDefault: false },
      });

      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
  }

  toDto(address: {
    id: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    district: string;
    city: string;
    postalCode: string;
    countryCode: string;
    isDefault: boolean;
  }): AddressDto {
    return {
      id: address.id,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      district: address.district,
      city: address.city,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      isDefault: address.isDefault,
    };
  }
}
