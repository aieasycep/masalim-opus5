/**
 * Reference data seeded into every environment.
 *
 * Interests, system voices, print products and shipping rates are product
 * configuration rather than demo content, so they are seeded in production too.
 * Demo users and stories live in seed.ts and are development-only.
 */

export const INTERESTS = [
  { slug: 'dinosaurs', labelKey: 'interest.dinosaurs', emoji: '🦕', sortOrder: 10 },
  { slug: 'space', labelKey: 'interest.space', emoji: '🚀', sortOrder: 20 },
  { slug: 'animals', labelKey: 'interest.animals', emoji: '🐾', sortOrder: 30 },
  { slug: 'cars', labelKey: 'interest.cars', emoji: '🚗', sortOrder: 40 },
  { slug: 'princesses', labelKey: 'interest.princesses', emoji: '👑', sortOrder: 50 },
  { slug: 'sea', labelKey: 'interest.sea', emoji: '🌊', sortOrder: 60 },
  { slug: 'nature', labelKey: 'interest.nature', emoji: '🌿', sortOrder: 70 },
  { slug: 'robots', labelKey: 'interest.robots', emoji: '🤖', sortOrder: 80 },
  { slug: 'football', labelKey: 'interest.football', emoji: '⚽', sortOrder: 90 },
  { slug: 'fairies', labelKey: 'interest.fairies', emoji: '🧚', sortOrder: 100 },
  { slug: 'adventure', labelKey: 'interest.adventure', emoji: '🗺️', sortOrder: 110 },
  { slug: 'music', labelKey: 'interest.music', emoji: '🎵', sortOrder: 120 },
] as const;

/**
 * System narrators.
 *
 * `providerVoiceId` values are ElevenLabs' public pre-made voices. They are
 * placeholders that make the mock and a real ElevenLabs key both work out of
 * the box; swap them for purpose-recorded Turkish voices before launch.
 */
export const SYSTEM_VOICES = [
  {
    slug: 'duru',
    displayName: 'Duru',
    descriptionKey: 'voice.duru.description',
    category: 'CALM',
    provider: 'elevenlabs',
    providerVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    presentation: 'female',
    premiumOnly: false,
    sortOrder: 10,
  },
  {
    slug: 'atlas',
    displayName: 'Atlas',
    descriptionKey: 'voice.atlas.description',
    category: 'CALM',
    provider: 'elevenlabs',
    providerVoiceId: 'onwK4e9ZLuTAKqWW03F9',
    presentation: 'male',
    premiumOnly: false,
    sortOrder: 20,
  },
  {
    slug: 'luna',
    displayName: 'Luna',
    descriptionKey: 'voice.luna.description',
    category: 'FAIRYTALE',
    provider: 'elevenlabs',
    providerVoiceId: 'XrExE9yKIg1WjnnlVkGX',
    presentation: 'female',
    premiumOnly: false,
    sortOrder: 30,
  },
  {
    slug: 'deniz',
    displayName: 'Deniz',
    descriptionKey: 'voice.deniz.description',
    category: 'CHEERFUL',
    provider: 'elevenlabs',
    providerVoiceId: 'pFZP5JQG7iQjIQuC4Bku',
    presentation: 'female',
    premiumOnly: false,
    sortOrder: 40,
  },
  {
    slug: 'poyraz',
    displayName: 'Poyraz',
    descriptionKey: 'voice.poyraz.description',
    category: 'ENERGETIC',
    provider: 'elevenlabs',
    providerVoiceId: 'TxGEqnHWrfWFTfGW9XjX',
    presentation: 'male',
    premiumOnly: true,
    sortOrder: 50,
  },
  {
    slug: 'nar',
    displayName: 'Nar',
    descriptionKey: 'voice.nar.description',
    category: 'FAIRYTALE',
    provider: 'elevenlabs',
    providerVoiceId: 'ThT5KcBeYPX3keUQqHPh',
    presentation: 'female',
    premiumOnly: true,
    sortOrder: 60,
  },
] as const;

/**
 * Print catalogue. Prices are placeholders pending the print partner contract,
 * but they are real Decimal values so the pricing engine and its tests exercise
 * the same code path production will.
 */
export const PRINT_PRODUCTS = [
  {
    sku: 'BOOK-SQ-HARD',
    bookSize: 'SQUARE',
    coverType: 'HARDCOVER',
    displayNameKey: 'product.square.hardcover',
    basePrice: '649.00',
    perPagePrice: '12.00',
    includedPages: 12,
    minPages: 4,
    maxPages: 24,
    productionDays: 4,
  },
  {
    sku: 'BOOK-SQ-SOFT',
    bookSize: 'SQUARE',
    coverType: 'SOFTCOVER',
    displayNameKey: 'product.square.softcover',
    basePrice: '449.00',
    perPagePrice: '9.00',
    includedPages: 12,
    minPages: 4,
    maxPages: 24,
    productionDays: 3,
  },
  {
    sku: 'BOOK-ST-HARD',
    bookSize: 'STANDARD',
    coverType: 'HARDCOVER',
    displayNameKey: 'product.standard.hardcover',
    basePrice: '699.00',
    perPagePrice: '13.00',
    includedPages: 12,
    minPages: 4,
    maxPages: 24,
    productionDays: 4,
  },
  {
    sku: 'BOOK-ST-SOFT',
    bookSize: 'STANDARD',
    coverType: 'SOFTCOVER',
    displayNameKey: 'product.standard.softcover',
    basePrice: '499.00',
    perPagePrice: '10.00',
    includedPages: 12,
    minPages: 4,
    maxPages: 24,
    productionDays: 3,
  },
] as const;

export const SHIPPING_RATES = [
  {
    countryCode: 'TR',
    city: null,
    price: '79.00',
    freeAboveSubtotal: '900.00',
    minDeliveryDays: 2,
    maxDeliveryDays: 5,
  },
  {
    countryCode: 'TR',
    city: 'İstanbul',
    price: '59.00',
    freeAboveSubtotal: '750.00',
    minDeliveryDays: 1,
    maxDeliveryDays: 3,
  },
  {
    countryCode: 'TR',
    city: 'Ankara',
    price: '59.00',
    freeAboveSubtotal: '750.00',
    minDeliveryDays: 2,
    maxDeliveryDays: 4,
  },
] as const;

export const FEATURE_FLAG_SEEDS = [
  {
    key: 'physical_books',
    enabled: true,
    description: 'Fiziksel kitap siparişi akışı',
  },
  {
    key: 'parent_voice_cloning',
    enabled: true,
    description: 'Anne/baba sesi klonlama',
  },
  { key: 'illustrations', enabled: true, description: 'AI illüstrasyon üretimi' },
  { key: 'subscriptions', enabled: true, description: 'Premium abonelik' },
  {
    key: 'story_sharing',
    enabled: false,
    description: 'Hikâye paylaşma (gelecek sürüm)',
  },
  { key: 'guest_mode', enabled: false, description: 'Misafir kullanım (gelecek sürüm)' },
] as const;

export const APP_VERSION_POLICIES = [
  {
    platform: 'IOS',
    minSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
  },
  {
    platform: 'ANDROID',
    minSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
  },
] as const;

/**
 * The passage a parent reads aloud to create their voice.
 * Roughly 60 seconds at a calm bedtime pace, phonetically varied, and warm
 * enough that reading it does not feel like a chore.
 */
export const VOICE_ENROLMENT_SCRIPT = `Bir varmış bir yokmuş, çok uzak dağların ötesinde, yıldızların arasında küçük bir köy varmış. Bu köyde yaşayan çocuklar her gece gökyüzüne bakarlarmış. Onlar için her yıldız bir hikâyenin başlangıcıymış.

Köyün en küçük evinde, pencere kenarında oturan bir çocuk yaşarmış. Adı neydi bilen yokmuş ama gülüşünü herkes tanırmış. Her akşam yorganını çenesine kadar çeker, gözlerini kapatır ve o gün duyduğu masalı yeniden kurarmış içinden.

Bazen bir ejderha olurmuş masalında, bazen kaybolmuş bir kedi. Bazen de sadece sıcak bir çorba ve tanıdık bir ses. Çünkü çocuk şunu çok iyi bilirmiş: en güzel masallar, sevdiğin birinin sesiyle anlatılanlarmış.

Ve o ses, ne kadar uzakta olursa olsun, her gece yanına gelirmiş.`;
