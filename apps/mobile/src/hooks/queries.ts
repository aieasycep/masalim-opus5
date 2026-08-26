import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { queryKeys, type VoiceConsentState } from '@masalim/api-client';
import type {
  AIJobDto,
  AddressDto,
  AppConfigDto,
  BookDto,
  BookRenderDto,
  ChildDto,
  DeletionRequestDto,
  EntitlementsResponse,
  HomeDto,
  IllustrationDto,
  IllustrationSetDto,
  InterestDto,
  NarrationDto,
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
  UserDto,
  VoiceProfileDto,
  PrivacyPreferencesDto,
} from '@masalim/types';
import type {
  AddressInput,
  AudioPreferencesInput,
  CreateBookInput,
  CreateChildInput,
  CreateIllustrationSetInput,
  CreateNarrationInput,
  CreateOrderInput,
  CreateStoryInput,
  CreateVoiceProfileInput,
  InitiatePaymentInput,
  ListStoriesInput,
  NotificationPreferencesInput,
  PriceQuoteInput,
  RenderBookInput,
  RequestAccountDeletionInput,
  SubmitVoiceRecordingInput,
  UpdateBookInput,
  UpdateBookPageInput,
  UpdateChildInput,
  PrivacyPreferencesInput,
  UpdateProfileInput,
  UpdateStoryInput,
} from '@masalim/validation';
import { api } from '../lib/api';
import { analytics } from '../lib/analytics';
import { env } from '../config/env';

/**
 * Server state, as hooks.
 *
 * Two conventions run through the file. Reads are plain queries keyed by the
 * shared `queryKeys` tree, and writes invalidate the *narrowest* key that could
 * have changed — a favourite toggle does not need to refetch the whole library,
 * but creating a story does, because Home, the Library and the usage meter all
 * move at once.
 */

export function useAppConfig(): UseQueryResult<AppConfigDto> {
  return useQuery({
    queryKey: queryKeys.app.config,
    queryFn: () => api.app.config({ platform: env.platform, appVersion: env.appVersion }),
    // The launch gate: a stale answer here would let a build below the floor in.
    staleTime: 5 * 60 * 1000,
  });
}

export function useHome(): UseQueryResult<HomeDto> {
  return useQuery({ queryKey: queryKeys.app.home, queryFn: () => api.app.home() });
}

export function useMe(): UseQueryResult<UserDto> {
  return useQuery({ queryKey: queryKeys.user.me, queryFn: () => api.users.me() });
}

// ------------------------------------------------------------- Children

export function useChildren(): UseQueryResult<ChildDto[]> {
  return useQuery({ queryKey: queryKeys.children.list(), queryFn: () => api.children.list() });
}

export function useInterests(): UseQueryResult<InterestDto[]> {
  return useQuery({
    queryKey: queryKeys.children.interests,
    queryFn: () => api.children.interests(),
    // Reference data; it changes when the product does, not while the app runs.
    staleTime: 60 * 60 * 1000,
  });
}

export function useChild(id: string | null): UseQueryResult<ChildDto> {
  return useQuery({
    queryKey: queryKeys.children.detail(id ?? ''),
    queryFn: () => api.children.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateChild(): UseMutationResult<ChildDto, unknown, CreateChildInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChildInput) => api.children.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.children.all });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
    },
  });
}

export function useUpdateChild(): UseMutationResult<
  ChildDto,
  unknown,
  { id: string; input: UpdateChildInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChildInput }) =>
      api.children.update(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.children.all });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
    },
  });
}

export function useDeleteChild(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.children.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.children.all });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
    },
  });
}

// -------------------------------------------------------------- Stories

export function useStories(
  input: Partial<ListStoriesInput> = {},
): UseQueryResult<Paginated<StorySummaryDto>> {
  return useQuery({
    queryKey: queryKeys.stories.list(input),
    queryFn: () => api.stories.list(input),
  });
}

export function useStory(id: string | null): UseQueryResult<StoryDto> {
  return useQuery({
    queryKey: queryKeys.stories.detail(id ?? ''),
    queryFn: () => api.stories.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateStory(): UseMutationResult<
  Awaited<ReturnType<typeof api.stories.create>>,
  unknown,
  CreateStoryInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoryInput) => api.stories.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.all });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
      // The monthly counter moved, and the paywall reads from it.
      void client.invalidateQueries({ queryKey: queryKeys.subscription.entitlements });
    },
  });
}

export function useUpdateStory(): UseMutationResult<
  StoryDto,
  unknown,
  { id: string; input: UpdateStoryInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStoryInput }) =>
      api.stories.update(id, input),
    onSuccess: (story) => {
      client.setQueryData(queryKeys.stories.detail(story.id), story);
      void client.invalidateQueries({ queryKey: queryKeys.stories.list() });
    },
  });
}

export function useDeleteStory(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.stories.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.all });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
    },
  });
}

/**
 * Favourite toggling, applied optimistically.
 *
 * A heart that waits for a round trip before filling in feels broken. The
 * previous value is captured so a failure puts it back rather than leaving the
 * UI claiming something the server never accepted.
 */
export function useToggleFavourite(): UseMutationResult<
  void,
  unknown,
  { id: string; favourite: boolean },
  { previous: StoryDto | undefined }
> {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favourite }: { id: string; favourite: boolean }) =>
      api.stories.setFavourite(id, favourite),

    onMutate: async ({ id, favourite }) => {
      await client.cancelQueries({ queryKey: queryKeys.stories.detail(id) });
      const previous = client.getQueryData<StoryDto>(queryKeys.stories.detail(id));

      if (previous) {
        client.setQueryData(queryKeys.stories.detail(id), {
          ...previous,
          isFavourite: favourite,
        });
      }
      return { previous };
    },

    onError: (_error, { id }, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.stories.detail(id), context.previous);
      }
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.list() });
      void client.invalidateQueries({ queryKey: queryKeys.app.home });
    },
  });
}

// -------------------------------------------------------------- Voices

export function useVoices(): UseQueryResult<VoiceProfileDto[]> {
  return useQuery({ queryKey: queryKeys.voices.list(), queryFn: () => api.voices.list() });
}

export function useVoice(id: string | null): UseQueryResult<VoiceProfileDto> {
  return useQuery({
    queryKey: queryKeys.voices.detail(id ?? ''),
    queryFn: () => api.voices.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useNarrators(): UseQueryResult<NarratorOption[]> {
  return useQuery({
    queryKey: queryKeys.voices.narrators,
    queryFn: () => api.voices.narrators(),
  });
}

export function useVoiceConsent() {
  return useQuery({ queryKey: queryKeys.voices.consent, queryFn: () => api.voices.consent() });
}

export function useEnrolmentScript() {
  return useQuery({
    queryKey: queryKeys.voices.script,
    queryFn: () => api.voices.enrolmentScript(),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useAcceptVoiceConsent(): UseMutationResult<VoiceConsentState, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (consentVersion: string) => api.voices.acceptConsent(consentVersion),
    onSuccess: (state) => {
      client.setQueryData(queryKeys.voices.consent, state);
    },
  });
}

export function useCreateVoice(): UseMutationResult<
  VoiceProfileDto,
  unknown,
  CreateVoiceProfileInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVoiceProfileInput) => api.voices.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.voices.all });
    },
  });
}

export function useSubmitVoiceRecording(): UseMutationResult<
  { voice: VoiceProfileDto; job: AIJobDto },
  unknown,
  { id: string; input: SubmitVoiceRecordingInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubmitVoiceRecordingInput }) =>
      api.voices.submitRecording(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.voices.all });
    },
  });
}

export function useRenameVoice(): UseMutationResult<
  VoiceProfileDto,
  unknown,
  { id: string; displayName: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      api.voices.rename(id, { displayName }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.voices.all });
    },
  });
}

export function useDeleteVoice(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.voices.remove(id),
    onSuccess: () => {
      // The narrator picker and any story that named this voice both go stale.
      void client.invalidateQueries({ queryKey: queryKeys.voices.all });
      void client.invalidateQueries({ queryKey: queryKeys.stories.all });
    },
  });
}

// ----------------------------------------------------------- Narration

export function useNarrations(storyId: string | null): UseQueryResult<NarrationDto[]> {
  return useQuery({
    queryKey: queryKeys.stories.narrations(storyId ?? ''),
    queryFn: () => api.narrations.listForStory(storyId ?? ''),
    enabled: Boolean(storyId),
  });
}

export function useNarration(id: string | null): UseQueryResult<NarrationDto> {
  return useQuery({
    queryKey: queryKeys.narrations.detail(id ?? ''),
    queryFn: () => api.narrations.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useNarrationSegments(id: string | null) {
  return useQuery({
    queryKey: queryKeys.narrations.segments(id ?? ''),
    queryFn: () => api.narrations.segments(id ?? ''),
    enabled: Boolean(id),
    // Timings never change once a narration is rendered.
    staleTime: Infinity,
  });
}

// -------------------------------------------------------- Illustrations

export function useIllustrationSets(storyId: string | null): UseQueryResult<IllustrationSetDto[]> {
  return useQuery({
    queryKey: queryKeys.stories.illustrations(storyId ?? ''),
    queryFn: () => api.illustrations.listForStory(storyId ?? ''),
    enabled: Boolean(storyId),
  });
}

export function useIllustrationSet(id: string | null): UseQueryResult<IllustrationSetDto> {
  return useQuery({
    queryKey: queryKeys.illustrationSets.detail(id ?? ''),
    queryFn: () => api.illustrations.getSet(id ?? ''),
    enabled: Boolean(id),
  });
}

/**
 * Asks for a story to be read aloud.
 *
 * The narration and its job come back together; the screen follows the job and
 * the story's narration list is stale the moment the job is queued.
 */
export function useCreateNarration(): UseMutationResult<
  { narration: NarrationDto; job: AIJobDto },
  unknown,
  { storyId: string; input: CreateNarrationInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, input }: { storyId: string; input: CreateNarrationInput }) =>
      api.narrations.create(storyId, input),
    onSuccess: (_result, { storyId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.narrations(storyId) });
      void client.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
      void client.invalidateQueries({ queryKey: queryKeys.subscription.entitlements });
    },
  });
}

export function useDeleteNarration(): UseMutationResult<
  void,
  unknown,
  { id: string; storyId: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; storyId: string }) => api.narrations.remove(id),
    onSuccess: (_result, { storyId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.narrations(storyId) });
      void client.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
    },
  });
}

export function useCreateIllustrationSet(): UseMutationResult<
  { set: IllustrationSetDto; job: AIJobDto },
  unknown,
  { storyId: string; input: CreateIllustrationSetInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, input }: { storyId: string; input: CreateIllustrationSetInput }) =>
      api.illustrations.create(storyId, input),
    onSuccess: (_result, { storyId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.stories.illustrations(storyId) });
      void client.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
      void client.invalidateQueries({ queryKey: queryKeys.subscription.entitlements });
    },
  });
}

export function useRegenerateIllustration(): UseMutationResult<
  { illustration: IllustrationDto; job: AIJobDto },
  unknown,
  { illustrationId: string; setId: string; idempotencyKey: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      illustrationId,
      idempotencyKey,
    }: {
      illustrationId: string;
      setId: string;
      idempotencyKey: string;
    }) => api.illustrations.regenerate(illustrationId, idempotencyKey),
    onSuccess: (_result, { setId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.illustrationSets.detail(setId) });
      void client.invalidateQueries({ queryKey: queryKeys.subscription.entitlements });
    },
  });
}

/** Picks which variant of a page's illustration is the keeper. */
export function useSelectIllustration(): UseMutationResult<IllustrationSetDto, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (illustrationId: string) => api.illustrations.select(illustrationId),
    onSuccess: (set) => {
      client.setQueryData(queryKeys.illustrationSets.detail(set.id), set);
    },
  });
}

// ---------------------------------------------------------------- Books

export function useBooks(): UseQueryResult<BookDto[]> {
  return useQuery({ queryKey: queryKeys.books.list(), queryFn: () => api.books.list() });
}

export function useBook(id: string | null): UseQueryResult<BookDto> {
  return useQuery({
    queryKey: queryKeys.books.detail(id ?? ''),
    queryFn: () => api.books.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useBookRenders(id: string | null) {
  return useQuery({
    queryKey: queryKeys.books.renders(id ?? ''),
    queryFn: () => api.books.renders(id ?? ''),
    enabled: Boolean(id),
  });
}

/**
 * Book Builder autosave.
 *
 * The screen debounces; this just writes. The response replaces the cached book
 * rather than invalidating it, so the editor does not flash back to the previous
 * text while a refetch is in flight.
 */
export function useUpdateBook(): UseMutationResult<
  BookDto,
  unknown,
  { id: string; input: UpdateBookInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBookInput }) =>
      api.books.update(id, input),
    onSuccess: (book) => {
      client.setQueryData(queryKeys.books.detail(book.id), book);
    },
  });
}

export function useUpdateBookPage(): UseMutationResult<
  BookDto,
  unknown,
  { pageId: string; input: UpdateBookPageInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, input }: { pageId: string; input: UpdateBookPageInput }) =>
      api.books.updatePage(pageId, input),
    onSuccess: (book) => {
      client.setQueryData(queryKeys.books.detail(book.id), book);
    },
  });
}

export function useCreateBook(): UseMutationResult<BookDto, unknown, CreateBookInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookInput) => api.books.create(input),
    onSuccess: (book) => {
      client.setQueryData(queryKeys.books.detail(book.id), book);
      void client.invalidateQueries({ queryKey: queryKeys.books.list() });
      void client.invalidateQueries({ queryKey: queryKeys.stories.detail(book.storyId) });
    },
  });
}

export function useDeleteBook(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.books.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.books.all });
      void client.invalidateQueries({ queryKey: queryKeys.stories.all });
    },
  });
}

/**
 * Renders the book — a preview to read on the phone, or the print-ready file.
 *
 * Both go through a job, so the caller watches the returned job rather than
 * waiting on this promise; a full-colour book takes far longer than a request.
 */
export function useRenderBook(): UseMutationResult<
  { render: BookRenderDto; job: AIJobDto },
  unknown,
  { id: string; input: RenderBookInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RenderBookInput }) =>
      api.books.render(id, input),
    onSuccess: (_result, { id }) => {
      void client.invalidateQueries({ queryKey: queryKeys.books.renders(id) });
    },
  });
}

// ------------------------------------------------------------- Commerce

export function useAddresses(): UseQueryResult<AddressDto[]> {
  return useQuery({ queryKey: queryKeys.addresses.list(), queryFn: () => api.addresses.list() });
}

export function useCreateAddress(): UseMutationResult<AddressDto, unknown, AddressInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddressInput) => api.addresses.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.addresses.all });
    },
  });
}

export function usePrintProducts(): UseQueryResult<PrintProductDto[]> {
  return useQuery({
    queryKey: queryKeys.orders.products,
    queryFn: () => api.orders.products(),
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * A live price for the current configuration.
 *
 * Never cached beyond the screen: the total shown at checkout has to be the one
 * the server would charge, and a stale quote is how a parent sees one number and
 * is billed another.
 */
export function usePriceQuote(input: PriceQuoteInput | null): UseQueryResult<PriceQuoteDto> {
  return useQuery({
    queryKey: ['orders', 'quote', input],
    queryFn: () => api.orders.quote(input as PriceQuoteInput),
    enabled: input !== null,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useUpdateAddress(): UseMutationResult<
  AddressDto,
  unknown,
  { id: string; input: Partial<AddressInput> }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AddressInput> }) =>
      api.addresses.update(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.addresses.all });
    },
  });
}

export function useDeleteAddress(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.addresses.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.addresses.all });
    },
  });
}

/**
 * Places the order.
 *
 * The client sends configuration only — never a total. The price on the returned
 * order is the one the server computed from its own catalogue, and it is what the
 * confirmation screen shows.
 */
export function useCreateOrder(): UseMutationResult<OrderDto, unknown, CreateOrderInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => api.orders.create(input),
    onSuccess: (order) => {
      client.setQueryData(queryKeys.orders.detail(order.id), order);
      void client.invalidateQueries({ queryKey: queryKeys.orders.list() });
      // The book is now ORDERED, which the library and book screens both show.
      void client.invalidateQueries({ queryKey: queryKeys.books.all });
    },
  });
}

export function useCancelOrder(): UseMutationResult<OrderDto, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.orders.cancel(id),
    onSuccess: (order) => {
      client.setQueryData(queryKeys.orders.detail(order.id), order);
      void client.invalidateQueries({ queryKey: queryKeys.orders.list() });
    },
  });
}

/** Starts payment and returns the 3-D Secure hand-off the checkout screen opens. */
export function useInitiatePayment(): UseMutationResult<
  PaymentInitiationDto,
  unknown,
  InitiatePaymentInput
> {
  return useMutation({
    mutationFn: (input: InitiatePaymentInput) => api.orders.initiatePayment(input),
  });
}

/**
 * Confirms the outcome after the 3-D Secure page returns.
 *
 * The bank's redirect is not proof of anything — the server re-checks with the
 * provider, and this is how the app learns what actually happened.
 */
export function useVerifyPayment(): UseMutationResult<
  { status: PaymentStatus },
  unknown,
  { orderId: string; providerPaymentId: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, providerPaymentId }: { orderId: string; providerPaymentId: string }) =>
      api.orders.verifyPayment(orderId, providerPaymentId),
    onSuccess: (_result, { orderId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
      void client.invalidateQueries({ queryKey: queryKeys.orders.list() });
    },
  });
}

export function useOrders(): UseQueryResult<Paginated<OrderSummaryDto>> {
  return useQuery({ queryKey: queryKeys.orders.list(), queryFn: () => api.orders.list() });
}

export function useOrder(id: string | null): UseQueryResult<OrderDto> {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => api.orders.get(id ?? ''),
    enabled: Boolean(id),
  });
}

// --------------------------------------------------------- Subscription

export function useEntitlements(): UseQueryResult<EntitlementsResponse> {
  return useQuery({
    queryKey: queryKeys.subscription.entitlements,
    queryFn: () => api.subscription.entitlements(),
  });
}

export function useSubscription(): UseQueryResult<SubscriptionDto> {
  return useQuery({
    queryKey: queryKeys.subscription.current,
    queryFn: () => api.subscription.current(),
  });
}

// -------------------------------------------------------- Notifications

export function useNotifications(): UseQueryResult<NotificationDto[]> {
  return useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => api.notifications.list(),
  });
}

export function useRefreshSubscription(): UseMutationResult<SubscriptionDto, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.subscription.refresh(),
    onSuccess: (subscription) => {
      client.setQueryData(queryKeys.subscription.current, subscription);
      // Entitlements are what the guards read; they move with the subscription.
      void client.invalidateQueries({ queryKey: queryKeys.subscription.entitlements });
    },
  });
}

// ------------------------------------------------------- Profile & settings

export function useUpdateProfile(): UseMutationResult<UserDto, unknown, UpdateProfileInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.users.update(input),
    onSuccess: (user) => {
      client.setQueryData(queryKeys.user.me, user);
    },
  });
}

/**
 * Analytics consent.
 *
 * Read at start-up so the client knows whether it may capture anything at all,
 * and kept in the cache so the settings toggle and the analytics runtime never
 * disagree about what the parent chose.
 */
export function usePrivacyPreferences(): UseQueryResult<PrivacyPreferencesDto> {
  return useQuery({
    queryKey: queryKeys.user.privacyPreferences,
    queryFn: () => api.users.privacyPreferences(),
  });
}

export function useUpdatePrivacyPreferences(): UseMutationResult<
  PrivacyPreferencesDto,
  unknown,
  PrivacyPreferencesInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PrivacyPreferencesInput) => api.users.updatePrivacyPreferences(input),
    onSuccess: (preferences) => {
      client.setQueryData(queryKeys.user.privacyPreferences, preferences);
      // The runtime follows the stored decision immediately: withdrawing also
      // resets the provider, so the device-to-account link goes with it.
      analytics.setConsent(preferences.analyticsConsent);
    },
  });
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferencesInput> {
  return useQuery({
    queryKey: queryKeys.user.notificationPreferences,
    queryFn: () => api.users.notificationPreferences(),
  });
}

export function useUpdateNotificationPreferences(): UseMutationResult<
  NotificationPreferencesInput,
  unknown,
  NotificationPreferencesInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferencesInput) =>
      api.users.updateNotificationPreferences(input),
    onSuccess: (preferences) => {
      client.setQueryData(queryKeys.user.notificationPreferences, preferences);
    },
  });
}

export function useAudioPreferences(): UseQueryResult<AudioPreferencesInput> {
  return useQuery({
    queryKey: queryKeys.user.audioPreferences,
    queryFn: () => api.users.audioPreferences(),
  });
}

export function useUpdateAudioPreferences(): UseMutationResult<
  AudioPreferencesInput,
  unknown,
  AudioPreferencesInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AudioPreferencesInput) => api.users.updateAudioPreferences(input),
    onSuccess: (preferences) => {
      client.setQueryData(queryKeys.user.audioPreferences, preferences);
    },
  });
}

export function useCompleteOnboarding(): UseMutationResult<UserDto, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.users.completeOnboarding(),
    onSuccess: (user) => {
      client.setQueryData(queryKeys.user.me, user);
    },
  });
}

/**
 * Asks for the account to be deleted.
 *
 * A request, not an immediate wipe: the server records it and a worker carries it
 * out, including removing cloned voices at the provider. The returned record
 * carries the date that will happen, and the screen shows it rather than
 * implying the data is already gone.
 */
export function useRequestDeletion(): UseMutationResult<
  DeletionRequestDto,
  unknown,
  RequestAccountDeletionInput
> {
  return useMutation({
    mutationFn: (input: RequestAccountDeletionInput) => api.users.requestDeletion(input),
  });
}

export function useMarkNotificationRead(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications.list });
    },
  });
}

export function useMarkAllNotificationsRead(): UseMutationResult<void, unknown, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications.list });
    },
  });
}
