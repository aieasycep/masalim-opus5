# Providers

Every external service Masalım depends on sits behind an interface that the
business logic owns, with at least two implementations: a real adapter and a
complete mock. Which one runs is decided by one environment variable, resolved
once at boot.

This is not an abstraction for its own sake. It buys three specific things:

- **`pnpm dev` works with zero credentials.** Every flow in the app — generating
  a story, cloning a voice, narrating it, illustrating it, rendering a book,
  paying for a printed copy — runs end to end against mocks. A new contributor is
  productive before anyone has to share an API key.
- **The test suite exercises real code paths.** The mocks are not stubs that
  return `{}`. The image mock emits a real PNG, the speech mock a real WAV that
  ffmpeg can decode, the payment mock a real 3-D Secure hand-off. Integration
  tests therefore prove the pipeline, not just the plumbing around it.
- **Swapping a vendor is a configuration change.** Nothing under
  `apps/api/src/modules/` imports a vendor SDK.

## The rule that keeps it honest

A mock must never run in production. This is enforced twice, deliberately:

1. `apps/api/src/core/config/config.schema.ts` refuses to parse an environment
   where `APP_ENV=production` and any provider is set to `mock` (or storage to
   `local`). The process will not boot.
2. `packages/ai/src/factory.ts` refuses again at construction time.

The duplication is not an oversight. These particular failures are the ones that
would be hardest to notice in production: a family would simply receive a
nonsense story, or a tone instead of their mother's voice. A misconfiguration
that silently degrades is worse than one that refuses to start.

The same schema also rejects placeholder secrets, so a `.env.example` value
copied into a production deployment fails loudly rather than working badly.

## The roster

| Concern | Interface | Real adapter | Env var |
|---|---|---|---|
| Story generation | `StoryGenerationProvider` | Anthropic Claude, OpenAI | `AI_PROVIDER` |
| Content moderation | `ModerationProvider` | OpenAI `omni-moderation-latest` | `MODERATION_PROVIDER` |
| Illustration | `ImageGenerationProvider` | OpenAI `gpt-image-1` | `IMAGE_PROVIDER` |
| Narration | `TextToSpeechProvider` | ElevenLabs multilingual v2 | `TTS_PROVIDER` |
| Voice cloning | `VoiceCloneProvider` | ElevenLabs Instant Voice Cloning | `VOICE_CLONE_PROVIDER` |
| Media storage | `StorageProvider` | S3-compatible (Cloudflare R2) | `STORAGE_PROVIDER` |
| Card payments | `PaymentProvider` | iyzico (3-D Secure, TRY) | `PAYMENT_PROVIDER` |
| Subscriptions | `SubscriptionProvider` | RevenueCat | `SUBSCRIPTION_PROVIDER` |
| Print fulfilment | `PrintProvider` | — (mock ships; adapter is a drop-in) | `PRINT_PROVIDER` |
| Push notifications | `PushProvider` | Expo Push | `PUSH_PROVIDER` |
| Analytics | `AnalyticsProvider` | PostHog | `ANALYTICS_PROVIDER` |

Setting `AI_PROVIDER=anthropic` while leaving `TTS_PROVIDER=elevenlabs` and
`IMAGE_PROVIDER=openai` is the intended production shape, not a compromise —
each concern is picked independently on merit.

## Why these vendors

**Anthropic Claude for stories.** Long-form Turkish with consistent tone, and
reliable structured output — the generated story is validated against a Zod
schema and repaired on mismatch, so a model that respects a schema saves real
retries. The OpenAI adapter is equally complete and one env var away.

**OpenAI `gpt-image-1` for illustration.** The deciding factor is
reference-image support. Character consistency across a twelve-page storybook is
the whole problem; a `CharacterBible` derived once per set is injected into every
page prompt, and the generated cover is then passed back as a reference image for
subsequent pages. Providers without reference images fall back to prompt-only
consistency, which is visibly worse.

**ElevenLabs for voice.** Best Turkish quality among the cloning services, and
Instant Voice Cloning works from the ~60 seconds of audio the enrolment flow
asks a parent for. Longer would be a worse product.

**Cloudflare R2 for storage.** S3-compatible, so the adapter is the standard one,
with no egress charges — this app streams audio and full-colour book PDFs, which
is exactly the workload that makes S3 egress hurt.

**iyzico for payments.** Turkish acquiring, TRY, 3-D Secure and instalments,
which the printed-book checkout needs and Stripe does not serve well in Turkey.

## What a mock has to do

A mock is only useful if it fails the way the real thing fails. Each one
therefore produces genuine artefacts and genuine rejections:

- **Story** — returns a schema-valid Turkish story whose page count, words per
  page and vocabulary respect the requested age band, so age-band logic is
  actually exercised.
- **Moderation** — matches a Turkish deny-list with a Unicode word-start anchor.
  A trailing `\b` would miss agglutinative suffixes and an ASCII `\b` fails
  before "ö", so neither is used. It really does reject unsafe prompts.
- **Image** — writes a real PNG at the requested dimensions.
- **Speech** — writes a real WAV whose duration matches the text length, so the
  narration pipeline's ffmpeg concatenation and duration measurement run for
  real.
- **Voice clone** — models the provider lifecycle including deletion, so the
  "delete at the provider, then locally" ordering is covered.
- **Payment** — returns a real 3-D Secure hand-off and can be driven to success,
  failure and timeout.
- **Print** — accepts a print file and advances through the fulfilment states.

## Failure handling

Adapters raise `ProviderError` with a `kind` (`rate_limited`,
`invalid_response`, `content_filtered`, `unauthorized`, `timeout`,
`unavailable`, `unknown`) and a derived `retryable` flag. The job worker retries
only what is retryable; a 4xx-class domain failure is marked terminal
immediately rather than being attempted three times, because retrying a refusal
just delays telling the parent.

Every call records `ProviderUsage` — provider, model, tokens or characters or
image count, and latency — into `AIUsageLog`, so AI spend is attributable per
user and capped before it becomes a surprise.

## Adding a provider

1. Implement the interface in `packages/<concern>/src/providers/<vendor>/`.
2. Add the branch to that package's factory, with the key requirement expressed
   through `requireKey` so a missing credential fails at boot rather than on a
   parent's first request.
3. Extend the env schema: the new enum value, its credentials, and the
   production guard.
4. Document the variable in `.env.example` with what it is and where to get it.

Business logic should not change. If it has to, the interface was wrong.
