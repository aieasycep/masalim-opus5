import type {
  AddressDto,
  AIJobDto,
  AppConfigDto,
  AuthSession,
  AuthTokens,
  BookDto,
  BookRenderDto,
  ChildDto,
  EntitlementsResponse,
  HomeDto,
  IllustrationDto,
  IllustrationSetDto,
  InterestDto,
  NarrationDto,
  NarrationSegment,
  NarratorOption,
  NotificationDto,
  OrderDto,
  OrderSummaryDto,
  Paginated,
  PaymentInitiationDto,
  PaymentStatus,
  PriceQuoteDto,
  PrintProductDto,
  StoryDto,
  StorySummaryDto,
  SubscriptionDto,
  SystemVoiceDto,
  UserDto,
  VoiceProfileDto,
} from '@masalim/types';
import type {
  AddressInput,
  CreateBookInput,
  CreateChildInput,
  CreateIllustrationSetInput,
  CreateNarrationInput,
  CreateOrderInput,
  CreateStoryInput,
  CreateVoiceProfileInput,
  InitiatePaymentInput,
  ListStoriesInput,
  PriceQuoteInput,
  RegisterDeviceInput,
  RenameVoiceProfileInput,
  RenderBookInput,
  SignInInput,
  SignUpInput,
  SubmitVoiceRecordingInput,
  UpdateBookInput,
  UpdateBookPageInput,
  UpdateChildInput,
  UpdateProfileInput,
  UpdateStoryInput,
  UpdateStoryProgressInput,
  AudioPreferencesInput,
  NotificationPreferencesInput,
} from '@masalim/validation';
import type { HttpClient } from './http';

export interface VoiceConsentState {
  version: string;
  acceptedAt: string | null;
}

export interface SignedUpload {
  assetId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/**
 * Every endpoint the app calls, in one typed surface.
 *
 * Request and response types come from the same packages the server validates
 * and serialises with, so a contract change is a compile error in the app rather
 * than a runtime surprise on a parent's phone.
 */
export function createEndpoints(http: HttpClient) {
  return {
    auth: {
      signUp: (body: SignUpInput) =>
        http.post<AuthSession>('/auth/sign-up', body, { anonymous: true }),
      signIn: (body: SignInInput) =>
        http.post<AuthSession>('/auth/sign-in', body, { anonymous: true }),
      signInWithApple: (identityToken: string, name?: string) =>
        http.post<AuthSession>(
          '/auth/apple',
          { identityToken, ...(name ? { name } : {}) },
          { anonymous: true },
        ),
      signInWithGoogle: (idToken: string) =>
        http.post<AuthSession>('/auth/google', { idToken }, { anonymous: true }),
      refresh: (refreshToken: string) =>
        http.post<AuthTokens>('/auth/refresh', { refreshToken }, { anonymous: true }),
      signOut: (refreshToken: string) => http.post<void>('/auth/sign-out', { refreshToken }),
      requestPasswordReset: (email: string) =>
        http.post<void>('/auth/password-reset', { email }, { anonymous: true }),
    },

    app: {
      config: (query: { platform?: 'IOS' | 'ANDROID'; appVersion?: string }) =>
        http.get<AppConfigDto>('/app/config', { query, anonymous: true }),
      home: () => http.get<HomeDto>('/home'),
    },

    users: {
      me: () => http.get<UserDto>('/users/me'),
      update: (body: UpdateProfileInput) => http.patch<UserDto>('/users/me', body),
      notificationPreferences: () =>
        http.get<NotificationPreferencesInput>('/users/me/notification-preferences'),
      updateNotificationPreferences: (body: NotificationPreferencesInput) =>
        http.patch<NotificationPreferencesInput>('/users/me/notification-preferences', body),
      audioPreferences: () => http.get<AudioPreferencesInput>('/users/me/audio-preferences'),
      updateAudioPreferences: (body: AudioPreferencesInput) =>
        http.patch<AudioPreferencesInput>('/users/me/audio-preferences', body),
      completeOnboarding: () => http.post<UserDto>('/users/me/onboarding-complete'),
      requestDeletion: (reason?: string) =>
        http.post<void>('/users/me/deletion-request', reason ? { reason } : {}),
    },

    children: {
      interests: () => http.get<InterestDto[]>('/interests'),
      list: () => http.get<ChildDto[]>('/children'),
      create: (body: CreateChildInput) => http.post<ChildDto>('/children', body),
      get: (id: string) => http.get<ChildDto>(`/children/${id}`),
      update: (id: string, body: UpdateChildInput) =>
        http.patch<ChildDto>(`/children/${id}`, body),
      remove: (id: string) => http.delete<void>(`/children/${id}`),
    },

    stories: {
      create: (body: CreateStoryInput) =>
        http.post<{ story: StoryDto; job: AIJobDto }>('/stories', body, {
          idempotencyKey: body.idempotencyKey,
        }),
      list: (query: Partial<ListStoriesInput>) =>
        http.get<Paginated<StorySummaryDto>>('/stories', {
          query: {
            ...(query.cursor ? { cursor: query.cursor } : {}),
            ...(query.limit ? { limit: query.limit } : {}),
            ...(query.childId ? { childId: query.childId } : {}),
            ...(query.filter ? { filter: query.filter } : {}),
            ...(query.search ? { search: query.search } : {}),
            ...(query.sort ? { sort: query.sort } : {}),
          },
        }),
      get: (id: string) => http.get<StoryDto>(`/stories/${id}`),
      update: (id: string, body: UpdateStoryInput) =>
        http.patch<StoryDto>(`/stories/${id}`, body),
      remove: (id: string) => http.delete<void>(`/stories/${id}`),
      setFavourite: (id: string, favourite: boolean) =>
        favourite
          ? http.put<void>(`/stories/${id}/favourite`)
          : http.delete<void>(`/stories/${id}/favourite`),
      saveProgress: (id: string, body: UpdateStoryProgressInput) =>
        http.put<void>(`/stories/${id}/progress`, body),
    },

    jobs: {
      get: (id: string) => http.get<AIJobDto>(`/jobs/${id}`),
      retry: (id: string) => http.post<AIJobDto>(`/jobs/${id}/retry`),
      streamUrl: (id: string) => http.url(`/jobs/${id}/stream`),
    },

    voices: {
      consent: () => http.get<VoiceConsentState>('/voices/consent'),
      acceptConsent: (consentVersion: string) =>
        http.post<VoiceConsentState>('/voices/consent', { consentVersion, accepted: true }),
      enrolmentScript: () =>
        http.get<{ version: string; paragraphs: string[] }>('/voices/enrolment-script'),
      systemVoices: () => http.get<SystemVoiceDto[]>('/voices/system'),
      narrators: () => http.get<NarratorOption[]>('/voices/narrators'),
      list: () => http.get<VoiceProfileDto[]>('/voices'),
      create: (body: CreateVoiceProfileInput) => http.post<VoiceProfileDto>('/voices', body),
      get: (id: string) => http.get<VoiceProfileDto>(`/voices/${id}`),
      submitRecording: (id: string, body: SubmitVoiceRecordingInput) =>
        http.post<{ voice: VoiceProfileDto; job: AIJobDto }>(`/voices/${id}/recording`, body, {
          idempotencyKey: body.idempotencyKey,
        }),
      rename: (id: string, body: RenameVoiceProfileInput) =>
        http.patch<VoiceProfileDto>(`/voices/${id}`, body),
      remove: (id: string) => http.delete<void>(`/voices/${id}`),
    },

    narrations: {
      create: (storyId: string, body: CreateNarrationInput) =>
        http.post<{ narration: NarrationDto; job: AIJobDto }>(
          `/stories/${storyId}/narrations`,
          body,
          { idempotencyKey: body.idempotencyKey },
        ),
      listForStory: (storyId: string) =>
        http.get<NarrationDto[]>(`/stories/${storyId}/narrations`),
      get: (id: string) => http.get<NarrationDto>(`/narrations/${id}`),
      segments: (id: string) => http.get<NarrationSegment[]>(`/narrations/${id}/segments`),
      remove: (id: string) => http.delete<void>(`/narrations/${id}`),
    },

    illustrations: {
      create: (storyId: string, body: CreateIllustrationSetInput) =>
        http.post<{ set: IllustrationSetDto; job: AIJobDto }>(
          `/stories/${storyId}/illustrations`,
          body,
          { idempotencyKey: body.idempotencyKey },
        ),
      listForStory: (storyId: string) =>
        http.get<IllustrationSetDto[]>(`/stories/${storyId}/illustrations`),
      getSet: (id: string) => http.get<IllustrationSetDto>(`/illustration-sets/${id}`),
      regenerate: (illustrationId: string, idempotencyKey: string) =>
        http.post<{ illustration: IllustrationDto; job: AIJobDto }>(
          '/illustrations/regenerate',
          { illustrationId, idempotencyKey },
          { idempotencyKey },
        ),
      select: (illustrationId: string) =>
        http.post<IllustrationSetDto>(`/illustrations/${illustrationId}/select`),
    },

    books: {
      create: (body: CreateBookInput) =>
        http.post<BookDto>('/books', body, { idempotencyKey: body.idempotencyKey }),
      list: () => http.get<BookDto[]>('/books'),
      get: (id: string) => http.get<BookDto>(`/books/${id}`),
      update: (id: string, body: UpdateBookInput) => http.patch<BookDto>(`/books/${id}`, body),
      updatePage: (pageId: string, body: UpdateBookPageInput) =>
        http.patch<BookDto>(`/book-pages/${pageId}`, body),
      remove: (id: string) => http.delete<void>(`/books/${id}`),
      render: (id: string, body: RenderBookInput) =>
        http.post<{ render: BookRenderDto; job: AIJobDto }>(`/books/${id}/renders`, body, {
          idempotencyKey: body.idempotencyKey,
        }),
      renders: (id: string) => http.get<BookRenderDto[]>(`/books/${id}/renders`),
    },

    addresses: {
      list: () => http.get<AddressDto[]>('/addresses'),
      create: (body: AddressInput) => http.post<AddressDto>('/addresses', body),
      update: (id: string, body: Partial<AddressInput>) =>
        http.patch<AddressDto>(`/addresses/${id}`, body),
      remove: (id: string) => http.delete<void>(`/addresses/${id}`),
    },

    orders: {
      products: () => http.get<PrintProductDto[]>('/print-products'),
      quote: (body: PriceQuoteInput) => http.post<PriceQuoteDto>('/orders/quote', body),
      create: (body: CreateOrderInput) =>
        http.post<OrderDto>('/orders', body, { idempotencyKey: body.idempotencyKey }),
      list: (query: { cursor?: string; limit?: number } = {}) =>
        http.get<Paginated<OrderSummaryDto>>('/orders', { query }),
      get: (id: string) => http.get<OrderDto>(`/orders/${id}`),
      cancel: (id: string) => http.post<OrderDto>(`/orders/${id}/cancel`),
      initiatePayment: (body: InitiatePaymentInput) =>
        http.post<PaymentInitiationDto>('/payments/initiate', body, {
          idempotencyKey: body.idempotencyKey,
        }),
      verifyPayment: (orderId: string, providerPaymentId: string) =>
        http.post<{ status: PaymentStatus }>('/payments/verify', {
          orderId,
          providerPaymentId,
        }),
    },

    subscription: {
      entitlements: () => http.get<EntitlementsResponse>('/subscription/entitlements'),
      current: () => http.get<SubscriptionDto>('/subscription'),
      refresh: () => http.post<SubscriptionDto>('/subscription/refresh'),
    },

    notifications: {
      list: (limit = 30) => http.get<NotificationDto[]>('/notifications', { query: { limit } }),
      registerDevice: (body: RegisterDeviceInput) =>
        http.post<void>('/notifications/devices', body),
      unregisterDevice: (token: string) =>
        http.post<void>('/notifications/devices/unregister', { token }),
      markRead: (id: string) => http.post<void>(`/notifications/${id}/read`),
      markAllRead: () => http.post<void>('/notifications/read-all'),
    },

    uploads: {
      request: (kind: string, contentType: string, sizeBytes: number) =>
        http.post<SignedUpload>('/uploads', { kind, contentType, sizeBytes }),
      confirm: (assetId: string) => http.post<{ assetId: string }>('/uploads/confirm', { assetId }),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
