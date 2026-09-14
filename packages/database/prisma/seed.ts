import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import argon2 from 'argon2';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  APP_VERSION_POLICIES,
  FEATURE_FLAG_SEEDS,
  INTERESTS,
  PRINT_PRODUCTS,
  SHIPPING_RATES,
  SYSTEM_VOICES,
} from './seed-data';
import { SEED_STORIES } from './seed-stories';

loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

const isProduction = process.env.APP_ENV === 'production';

/** Deterministic clock so re-running the seed produces stable relative dates. */
const NOW = new Date('2026-08-13T20:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

async function seedReferenceData(): Promise<void> {
  console.log('→ Reference data');

  for (const interest of INTERESTS) {
    await prisma.interest.upsert({
      where: { slug: interest.slug },
      create: { ...interest },
      update: {
        labelKey: interest.labelKey,
        emoji: interest.emoji,
        sortOrder: interest.sortOrder,
      },
    });
  }
  console.log(`  interests: ${INTERESTS.length}`);

  for (const voice of SYSTEM_VOICES) {
    await prisma.systemVoice.upsert({
      where: { slug: voice.slug },
      create: { ...voice },
      update: {
        displayName: voice.displayName,
        descriptionKey: voice.descriptionKey,
        category: voice.category,
        provider: voice.provider,
        providerVoiceId: voice.providerVoiceId,
        premiumOnly: voice.premiumOnly,
        sortOrder: voice.sortOrder,
      },
    });
  }
  console.log(`  system voices: ${SYSTEM_VOICES.length}`);

  for (const product of PRINT_PRODUCTS) {
    await prisma.printProduct.upsert({
      where: { sku: product.sku },
      create: {
        ...product,
        basePrice: new Prisma.Decimal(product.basePrice),
        perPagePrice: new Prisma.Decimal(product.perPagePrice),
      },
      update: {
        basePrice: new Prisma.Decimal(product.basePrice),
        perPagePrice: new Prisma.Decimal(product.perPagePrice),
        includedPages: product.includedPages,
        productionDays: product.productionDays,
        isActive: true,
      },
    });
  }
  console.log(`  print products: ${PRINT_PRODUCTS.length}`);

  for (const rate of SHIPPING_RATES) {
    await prisma.shippingRate.upsert({
      where: { countryCode_city: { countryCode: rate.countryCode, city: rate.city ?? '' } },
      create: {
        countryCode: rate.countryCode,
        city: rate.city,
        price: new Prisma.Decimal(rate.price),
        freeAboveSubtotal: new Prisma.Decimal(rate.freeAboveSubtotal),
        minDeliveryDays: rate.minDeliveryDays,
        maxDeliveryDays: rate.maxDeliveryDays,
      },
      update: {
        price: new Prisma.Decimal(rate.price),
        freeAboveSubtotal: new Prisma.Decimal(rate.freeAboveSubtotal),
      },
    });
  }
  console.log(`  shipping rates: ${SHIPPING_RATES.length}`);

  for (const flag of FEATURE_FLAG_SEEDS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: { ...flag },
      update: { description: flag.description },
    });
  }
  console.log(`  feature flags: ${FEATURE_FLAG_SEEDS.length}`);

  for (const policy of APP_VERSION_POLICIES) {
    await prisma.appVersionPolicy.upsert({
      where: { platform: policy.platform },
      create: { ...policy },
      update: {
        minSupportedVersion: policy.minSupportedVersion,
        latestVersion: policy.latestVersion,
        forceUpdate: policy.forceUpdate,
      },
    });
  }
  console.log(`  app version policies: ${APP_VERSION_POLICIES.length}`);
}

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    console.log('→ Admin user skipped (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set)');
    return;
  }

  if (isProduction && password.length < 16) {
    throw new Error(
      'Refusing to seed a production admin with a short password. Set a strong ADMIN_SEED_PASSWORD.',
    );
  }

  await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: 'Masalım Admin',
      role: 'ADMIN',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
    update: {},
  });
  console.log(`→ Admin user: ${email}`);
}

async function seedDemoContent(): Promise<void> {
  console.log('→ Demo content (development only)');

  const password = await argon2.hash('masalim-demo-2026', { type: argon2.argon2id });

  const parent = await prisma.user.upsert({
    where: { email: 'ayse@masalim.local' },
    create: {
      email: 'ayse@masalim.local',
      name: 'Ayşe Yılmaz',
      passwordHash: password,
      onboardingCompleted: true,
      subscriptionTier: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      termsAcceptedAt: daysAgo(90),
      identities: {
        create: { provider: 'EMAIL', providerAccountId: 'ayse@masalim.local' },
      },
      notificationPrefs: { create: {} },
      audioPrefs: { create: {} },
      subscription: {
        create: {
          provider: 'mock',
          store: 'MOCK',
          productId: 'masalim_premium_yearly',
          status: 'ACTIVE',
          startedAt: daysAgo(60),
          expiresAt: new Date('2027-08-11T00:00:00.000Z'),
          willRenew: true,
        },
      },
    },
    update: {},
  });

  const freeParent = await prisma.user.upsert({
    where: { email: 'mehmet@masalim.local' },
    create: {
      email: 'mehmet@masalim.local',
      name: 'Mehmet Demir',
      passwordHash: password,
      onboardingCompleted: true,
      termsAcceptedAt: daysAgo(10),
      identities: {
        create: { provider: 'EMAIL', providerAccountId: 'mehmet@masalim.local' },
      },
      notificationPrefs: { create: {} },
      audioPrefs: { create: {} },
    },
    update: {},
  });
  console.log(`  users: ${parent.email} (premium), ${freeParent.email} (free)`);

  const interestBySlug = new Map(
    (await prisma.interest.findMany()).map((interest) => [interest.slug, interest.id]),
  );
  const connectInterests = (slugs: string[]) => ({
    create: slugs
      .map((slug) => interestBySlug.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((interestId) => ({ interestId })),
  });

  const existingEge = await prisma.child.findFirst({
    where: { userId: parent.id, name: 'Ege' },
  });
  const ege =
    existingEge ??
    (await prisma.child.create({
      data: {
        userId: parent.id,
        name: 'Ege',
        birthDate: new Date('2020-03-14T00:00:00.000Z'),
        ageRange: 'AGE_6_8',
        customInterests: ['gökyüzü'],
        preferences: { addressAs: 'Ege', favouriteColour: 'lacivert' },
        interests: connectInterests(['space', 'dinosaurs', 'adventure']),
      },
    }));

  const existingAda = await prisma.child.findFirst({
    where: { userId: parent.id, name: 'Ada' },
  });
  const ada =
    existingAda ??
    (await prisma.child.create({
      data: {
        userId: parent.id,
        name: 'Ada',
        birthDate: new Date('2022-07-02T00:00:00.000Z'),
        ageRange: 'AGE_3_5',
        preferences: { addressAs: 'Ada' },
        interests: connectInterests(['animals', 'nature', 'fairies']),
      },
    }));
  console.log('  children: Ege (6), Ada (4)');

  const childIdByKey = { ege: ege.id, ada: ada.id } as const;

  const motherVoice = await prisma.voiceProfile.upsert({
    where: { id: 'seed_voice_mother_0000000' },
    create: {
      id: 'seed_voice_mother_0000000',
      userId: parent.id,
      ownerType: 'MOTHER',
      displayName: 'Annemin Sesi',
      provider: 'mock',
      providerVoiceId: 'mock-voice-mother',
      status: 'READY',
      consentAcceptedAt: daysAgo(32),
      consentVersion: '2026-08-01',
      createdAt: daysAgo(32),
    },
    update: {},
  });

  await prisma.voiceProfile.upsert({
    where: { id: 'seed_voice_father_0000000' },
    create: {
      id: 'seed_voice_father_0000000',
      userId: parent.id,
      ownerType: 'FATHER',
      displayName: 'Babamın Sesi',
      provider: 'mock',
      providerVoiceId: 'mock-voice-father',
      status: 'READY',
      consentAcceptedAt: daysAgo(39),
      consentVersion: '2026-08-01',
      createdAt: daysAgo(39),
    },
    update: {},
  });
  console.log('  voice profiles: Anne (READY), Baba (READY)');

  const duru = await prisma.systemVoice.findUniqueOrThrow({ where: { slug: 'duru' } });

  let storyCount = 0;
  for (const [index, seed] of SEED_STORIES.entries()) {
    const storyId = `seed_story_${seed.key}`.padEnd(25, '0').slice(0, 25);
    const existing = await prisma.story.findUnique({ where: { id: storyId } });
    if (existing) continue;

    const createdAt = daysAgo(1 + index * 5);

    await prisma.story.create({
      data: {
        id: storyId,
        userId: parent.id,
        childId: seed.childKey ? childIdByKey[seed.childKey] : null,
        title: seed.title,
        summary: seed.summary,
        heroName: seed.heroName,
        heroType: seed.heroType,
        themes: seed.themes,
        ageRange: seed.ageRange,
        durationTarget: seed.durationTarget,
        storyText: seed.pages.map((page) => page.text).join('\n\n'),
        status: 'READY',
        moderationStatus: 'APPROVED',
        createdAt,
        updatedAt: createdAt,
        pages: {
          create: seed.pages.map((page, pageIndex) => ({
            pageNumber: pageIndex + 1,
            text: page.text,
            illustrationPrompt: page.illustrationPrompt,
          })),
        },
        versions: {
          create: {
            version: 1,
            title: seed.title,
            pages: seed.pages.map((page, pageIndex) => ({
              pageNumber: pageIndex + 1,
              text: page.text,
            })),
          },
        },
        narrations: {
          create: {
            // The first demo story is narrated by the mother's voice, the rest by
            // a system voice, so the Library shows both badge styles.
            ...(index === 0
              ? { voiceProfileId: motherVoice.id }
              : { systemVoiceId: duru.id }),
            provider: 'mock',
            status: 'READY',
            durationSeconds: seed.durationTarget === 'SHORT' ? 186 : 372,
            createdAt,
          },
        },
      },
    });
    storyCount += 1;
  }
  console.log(`  stories: ${storyCount} created`);

  // A part-listened story so Home has something for "Kaldığın yerden devam et".
  const firstStory = await prisma.story.findFirst({
    where: { userId: parent.id },
    orderBy: { createdAt: 'desc' },
    include: { narrations: true },
  });
  const firstNarration = firstStory?.narrations[0];
  if (firstStory && firstNarration) {
    await prisma.storyProgress.upsert({
      where: { userId_storyId: { userId: parent.id, storyId: firstStory.id } },
      create: {
        userId: parent.id,
        storyId: firstStory.id,
        narrationId: firstNarration.id,
        positionSeconds: Math.round((firstNarration.durationSeconds ?? 372) * 0.68),
      },
      update: {},
    });
    await prisma.favourite.upsert({
      where: { userId_storyId: { userId: parent.id, storyId: firstStory.id } },
      create: { userId: parent.id, storyId: firstStory.id },
      update: {},
    });
    console.log('  progress + favourite seeded for Home');
  }

  await prisma.address.upsert({
    where: { id: 'seed_address_00000000000' },
    create: {
      id: 'seed_address_00000000000',
      userId: parent.id,
      fullName: 'Ayşe Yılmaz',
      phone: '+905321234567',
      line1: 'Bağdat Caddesi No: 142 Daire 7',
      district: 'Kadıköy',
      city: 'İstanbul',
      postalCode: '34710',
      isDefault: true,
    },
    update: {},
  });
  console.log('  address: Kadıköy, İstanbul');
}

async function main(): Promise<void> {
  console.log(`Seeding Masalım (APP_ENV=${process.env.APP_ENV ?? 'development'})\n`);

  await seedReferenceData();
  await seedAdmin();

  if (isProduction) {
    console.log('\n→ Demo content skipped in production');
  } else {
    await seedDemoContent();
  }

  console.log('\nSeed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
