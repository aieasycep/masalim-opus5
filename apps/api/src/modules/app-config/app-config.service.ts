import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AppConfigDto, DevicePlatform, FeatureFlagKey } from '@masalim/types';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Compares dotted version strings numerically.
 *
 * `"1.10.0" < "1.9.0"` is what string comparison would say, and the consequence
 * is telling everyone on the newest build that they must update.
 */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

@Injectable()
export class AppConfigModuleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the app needs to decide what to show on launch.
   *
   * One request rather than three, because it runs before the first screen and
   * a cold start on a Turkish mobile connection is exactly where extra round
   * trips are felt.
   */
  async forClient(params: {
    userId: string | null;
    platform?: DevicePlatform | undefined;
    appVersion?: string | undefined;
  }): Promise<AppConfigDto> {
    const [flags, policy] = await Promise.all([
      this.prisma.client.featureFlag.findMany(),
      params.platform
        ? this.prisma.client.appVersionPolicy.findUnique({
            where: { platform: params.platform },
          })
        : Promise.resolve(null),
    ]);

    const features: Record<string, boolean> = {};
    for (const flag of flags) {
      features[flag.key] = this.isOn(flag, params.userId);
    }

    const update =
      policy && params.appVersion
        ? {
            minSupportedVersion: policy.minSupportedVersion,
            latestVersion: policy.latestVersion,
            // Forced only when the running build is genuinely below the floor.
            // A flag that blocks everyone regardless of version is how a bad
            // release locks an entire user base out.
            updateRequired:
              policy.forceUpdate &&
              compareVersions(params.appVersion, policy.minSupportedVersion) < 0,
            updateAvailable: compareVersions(params.appVersion, policy.latestVersion) < 0,
            messageKey: policy.messageKey,
          }
        : null;

    return { features: features as Record<FeatureFlagKey, boolean>, update };
  }

  /**
   * Deterministic percentage rollout.
   *
   * Bucketed on a hash of the flag key and the user id, so a parent stays in the
   * same bucket across sessions — a feature that flickers on and off between
   * app launches is worse than one that is simply off.
   */
  private isOn(
    flag: { key: string; enabled: boolean; rolloutPercentage: number },
    userId: string | null,
  ): boolean {
    if (!flag.enabled) return false;
    if (flag.rolloutPercentage >= 100) return true;
    if (flag.rolloutPercentage <= 0) return false;
    if (!userId) return false;

    const digest = createHash('sha256').update(`${flag.key}:${userId}`).digest();
    return digest.readUInt16BE(0) % 100 < flag.rolloutPercentage;
  }
}
