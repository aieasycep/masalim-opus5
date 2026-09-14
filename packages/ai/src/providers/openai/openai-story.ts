import OpenAI from 'openai';
import { generatedStorySchema, type GeneratedStory } from '@masalim/validation';
import { buildRepairPrompt } from '../../prompt-builder';
import {
  ProviderError,
  type BuiltPrompt,
  type ProviderResult,
  type StoryGenerationInput,
  type StoryGenerationProvider,
} from '../../types';

export interface OpenAIStoryOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/**
 * Story generation via OpenAI.
 *
 * Fully equivalent to the Anthropic adapter — `AI_PROVIDER=openai` switches to
 * it with no other change — so the two can be compared on real Turkish stories
 * before committing to one.
 */
export class OpenAIStoryProvider implements StoryGenerationProvider {
  readonly name = 'openai';

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIStoryOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 120_000,
      maxRetries: 2,
    });
    this.model = options.model;
  }

  async generateStory(
    _input: StoryGenerationInput,
    prompt: BuiltPrompt,
  ): Promise<ProviderResult<GeneratedStory>> {
    return this.request(prompt, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
  }

  async repairStory(
    prompt: BuiltPrompt,
    invalidOutput: string,
    issues: string[],
  ): Promise<ProviderResult<GeneratedStory>> {
    return this.request(prompt, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
      { role: 'assistant', content: invalidOutput.slice(0, 8000) },
      { role: 'user', content: buildRepairPrompt(prompt, invalidOutput, issues) },
    ]);
  }

  private async request(
    prompt: BuiltPrompt,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): Promise<ProviderResult<GeneratedStory>> {
    const startedAt = Date.now();

    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_completion_tokens: prompt.maxOutputTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'masalim_story',
            // Strict mode makes the schema a hard constraint rather than a hint.
            strict: true,
            schema: prompt.responseSchema,
          },
        },
      });
    } catch (error) {
      throw toProviderError(error);
    }

    const content = completion.choices[0]?.message.content;
    if (!content) {
      const refusal = completion.choices[0]?.message.refusal;
      if (refusal) {
        throw new ProviderError(`Model refused: ${refusal}`, 'content_filtered');
      }
      throw new ProviderError('Model returned no content', 'invalid_response');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch (error) {
      throw new ProviderError('Model returned invalid JSON', 'invalid_response', {
        cause: error,
      });
    }

    const parsed = generatedStorySchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new ProviderError(
        `Story failed schema validation: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
        'invalid_response',
      );
    }

    return {
      data: parsed.data,
      usage: {
        provider: this.name,
        model: this.model,
        ...(completion.usage?.prompt_tokens !== undefined
          ? { inputTokens: completion.usage.prompt_tokens }
          : {}),
        ...(completion.usage?.completion_tokens !== undefined
          ? { outputTokens: completion.usage.completion_tokens }
          : {}),
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return new ProviderError('OpenAI rate limit', 'rate_limited', { cause: error });
    }
    if (error.status === 401 || error.status === 403) {
      return new ProviderError('OpenAI rejected the API key', 'unauthorized', {
        cause: error,
      });
    }
    if (error.status === 400 && /content_policy|safety/i.test(error.message)) {
      return new ProviderError('OpenAI content policy', 'content_filtered', { cause: error });
    }
    if (error.status !== undefined && error.status >= 500) {
      return new ProviderError('OpenAI unavailable', 'unavailable', { cause: error });
    }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderError('OpenAI request timed out', 'timeout', { cause: error });
  }
  return new ProviderError('OpenAI request failed', 'unknown', { cause: error });
}
