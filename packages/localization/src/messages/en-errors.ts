import type { ClientErrorCode } from '@masalim/types';

export const EN_ERRORS: Record<ClientErrorCode, { title: string; message: string }> = {
  NETWORK_UNAVAILABLE: {
    title: 'You seem to be offline',
    message: 'Check your connection and try again. Nothing you entered was lost.',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong',
    message: 'We hit a problem, but we are on it. Please try again shortly.',
  },
  VALIDATION_FAILED: {
    title: 'Some details are missing',
    message: 'Please check the highlighted fields and try again.',
  },
  NOT_FOUND: { title: 'We could not find that', message: 'It may have been deleted.' },
  FORBIDDEN: { title: 'You do not have access', message: 'This content is not yours.' },
  UNAUTHORIZED: {
    title: 'Please sign in again',
    message: 'Your session has ended. You will pick up right where you left off.',
  },
  RATE_LIMITED: {
    title: 'That was a bit quick',
    message: 'Take a short break and try again.',
  },
  CONFLICT: {
    title: 'This has already been done',
    message: 'It looks like the same action was started twice.',
  },
  SERVICE_UNAVAILABLE: {
    title: 'We are a little busy',
    message: 'Please try again in a few minutes.',
  },
  APP_UPDATE_REQUIRED: {
    title: 'A new version is available',
    message: 'Please update the app to continue.',
  },
  FEATURE_DISABLED: {
    title: 'This feature is switched off',
    message: 'It will be back very soon.',
  },

  INVALID_CREDENTIALS: {
    title: 'Email or password is incorrect',
    message: 'Please check your details and try again.',
  },
  EMAIL_ALREADY_REGISTERED: {
    title: 'This email is already registered',
    message: 'Try signing in, or reset your password.',
  },
  TOKEN_EXPIRED: {
    title: 'Your session has ended',
    message: 'Sign in again to continue where you left off.',
  },
  TOKEN_INVALID: {
    title: 'We could not verify your session',
    message: 'For your safety, please sign in again.',
  },
  REFRESH_TOKEN_REUSED: {
    title: 'We signed you out for safety',
    message: 'We noticed something unexpected on your account. Please sign in again.',
  },
  SOCIAL_AUTH_FAILED: {
    title: 'Sign-in did not complete',
    message: 'Try again, or continue with email instead.',
  },
  ACCOUNT_DELETED: {
    title: 'This account has been deleted',
    message: 'You can create a new account to continue.',
  },

  PREMIUM_REQUIRED: {
    title: 'This is a Premium feature',
    message: 'Go Premium and you can start using it right away.',
  },
  QUOTA_EXCEEDED: {
    title: 'You have used this month’s allowance',
    message: 'It resets next month. You can also go Premium.',
  },
  VOICE_PROFILE_LIMIT_REACHED: {
    title: 'You have reached the voice limit',
    message: 'Delete one of your existing voices to add a new one.',
  },

  CHILD_NOT_FOUND: {
    title: 'We could not find that profile',
    message: 'It may have been deleted.',
  },

  STORY_NOT_FOUND: {
    title: 'We could not find that story',
    message: 'It may have been deleted. Have a look at your library.',
  },
  STORY_GENERATION_FAILED: {
    title: 'Something went wrong while writing the story',
    message: 'Your choices are saved. We can pick up where we stopped.',
  },
  STORY_GENERATION_TIMEOUT: {
    title: 'The story took a little too long',
    message: 'Nothing you chose was lost. Would you like to try again?',
  },
  STORY_CONTENT_NOT_SUITABLE: {
    title: 'We could not turn this idea into a story',
    message:
      'We cannot make a child-friendly story from this topic. We can change the idea together.',
  },
  STORY_NOT_READY: {
    title: 'The story is not ready yet',
    message: 'It may need a few more seconds.',
  },

  VOICE_PROFILE_NOT_FOUND: {
    title: 'We could not find that voice',
    message: 'It may have been deleted.',
  },
  VOICE_CONSENT_REQUIRED: {
    title: 'We need your permission first',
    message: 'Just tick the consent box and we can create your voice.',
  },
  VOICE_PROCESSING_FAILED: {
    title: 'Something went wrong while creating the voice',
    message: 'Your recording is safe. You do not need to read it again.',
  },
  VOICE_NOT_READY: {
    title: 'The voice is not ready yet',
    message: 'We will let you know when it is.',
  },
  AUDIO_TOO_SHORT: {
    title: 'The recording is a little short',
    message: 'Read for slightly longer and we can capture your voice much better.',
  },
  AUDIO_TOO_LONG: {
    title: 'The recording is a little long',
    message: 'About a minute is plenty.',
  },
  AUDIO_TOO_QUIET: {
    title: 'We could barely hear you',
    message: 'Hold the phone a bit closer and try again.',
  },
  AUDIO_TOO_NOISY: {
    title: 'There is some background noise',
    message: 'Somewhere quieter will give a much better result.',
  },
  AUDIO_CLIPPED: {
    title: 'The recording is a bit loud',
    message: 'Hold the phone a little further away and try again.',
  },
  AUDIO_MOSTLY_SILENT: {
    title: 'We could not hear any speech',
    message: 'Check your microphone is on and try again.',
  },
  AUDIO_FILE_CORRUPT: {
    title: 'We could not read the recording',
    message: 'We will need to record it again.',
  },

  NARRATION_NOT_FOUND: {
    title: 'We could not find that narration',
    message: 'You can narrate the story again with a new voice.',
  },
  NARRATION_FAILED: {
    title: 'The narration could not be finished',
    message: 'The story text is safe. We can try again.',
  },
  NARRATION_VOICE_REQUIRED: {
    title: 'Please choose a voice',
    message: 'Who should tell this story?',
  },

  ILLUSTRATION_FAILED: {
    title: 'The pictures could not be finished',
    message: 'Your story is safe. We can try creating them again.',
  },
  ILLUSTRATION_SET_NOT_FOUND: {
    title: 'We could not find those pictures',
    message: 'You can illustrate your story again.',
  },

  BOOK_NOT_FOUND: { title: 'We could not find that book', message: 'It may have been deleted.' },
  BOOK_RENDER_FAILED: {
    title: 'The book could not be prepared',
    message: 'Your pages are safe. We can try again.',
  },
  BOOK_NOT_READY_FOR_PRINT: {
    title: 'The book is not ready for print',
    message: 'Every page needs a picture first.',
  },

  ORDER_NOT_FOUND: {
    title: 'We could not find that order',
    message: 'Check My Orders for your other orders.',
  },
  ORDER_CREATION_FAILED: {
    title: 'The order could not be created',
    message: 'You were not charged. Please try again.',
  },
  ORDER_NOT_CANCELLABLE: {
    title: 'This order can no longer be cancelled',
    message: 'Your book is already in production. Get in touch and we will help.',
  },
  PAYMENT_FAILED: {
    title: 'The payment did not complete',
    message: 'You were not charged. You can try a different card.',
  },
  PAYMENT_DECLINED: {
    title: 'Your card was declined',
    message: 'Contact your bank, or try a different card.',
  },
  PAYMENT_VERIFICATION_FAILED: {
    title: 'We could not verify the payment',
    message: 'Any amount taken will be refunded shortly. Please get in touch.',
  },
  ADDRESS_INVALID: {
    title: 'Some address details are missing',
    message: 'Please check the city, district and postcode.',
  },
  ADDRESS_NOT_FOUND: {
    title: 'We could not find that address',
    message: 'You can add a new delivery address.',
  },
  PRODUCT_UNAVAILABLE: {
    title: 'That option is unavailable right now',
    message: 'Please choose a different size or cover.',
  },

  UPLOAD_FAILED: {
    title: 'The upload did not complete',
    message: 'Your recording is still on your device. We can try sending it again.',
  },
  UPLOAD_TOO_LARGE: {
    title: 'That file is a bit large',
    message: 'Please try a smaller file.',
  },
  UPLOAD_TYPE_NOT_ALLOWED: {
    title: 'We cannot use this file type',
    message: 'Please choose a different file.',
  },
  ASSET_NOT_FOUND: { title: 'We could not find the file', message: 'It may have been deleted.' },

  JOB_NOT_FOUND: {
    title: 'We could not find that task',
    message: 'It may already have finished.',
  },
  JOB_NOT_RETRYABLE: {
    title: 'This task cannot be retried',
    message: 'You will need to start again.',
  },

  SUBSCRIPTION_VERIFICATION_FAILED: {
    title: 'We could not verify your subscription',
    message: 'We will try again shortly. If you were charged, it will activate.',
  },
};
