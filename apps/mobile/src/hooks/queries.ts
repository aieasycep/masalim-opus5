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
  ChildDto,
  EntitlementsResponse,
  HomeDto,
  IllustrationSetDto,
  InterestDto,
  NarrationDto,
  NarratorOption,
  NotificationDto,
  OrderDto,
  OrderSummaryDto,
  Paginated,
  PriceQuoteDto,
  PrintProductDto,
  StoryDto,
  StorySummaryDto,
  SubscriptionDto,
  UserDto,
  VoiceProfileDto,
} from '@masalim/types';
import type {
  AddressInput,
  CreateChildInput,
  CreateStoryInput,
  CreateVoiceProfileInput,
  ListStoriesInput,
  PriceQuoteInput,
  SubmitVoiceRecordingInput,
  UpdateBookInput,
  UpdateBookPageInput,
  UpdateChildInput,
  UpdateStoryInput,
} from '@masalim/validation';
import { api } from '../lib/api';
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
