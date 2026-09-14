import Anthropic from '@anthropic-ai/sdk';
import { generatedStorySchema, type GeneratedStory } from '@masalim/validation';
import { buildRepairPrompt } from '../../prompt-builder';
import {
  ProviderError,
  type BuiltPrompt,
  type ProviderResult,
  type StoryGenerationInput,
  type StoryGenerationProvider,
} from '../../types';

export interface AnthropicStoryOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/**
 * Story generation via Claude.
 *
 * Structure is enforced with a tool definition rather than by asking for JSON in
 * prose: the model is given `submit_story` as its only way to answer, so the
 * response arrives as validated arguments instead of prose that has to be
 * scraped for a JSON block.
 */
export class AnthropicStoryProvider implements StoryGenerationProvider {
  readonly name = 'anthropic';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicStoryOptions) {
    this.client = new Anthropic({
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
    return this.request(prompt, [{ role: 'user', content: prompt.user }]);
  }

  async repairStory(
    prompt: BuiltPrompt,
    invalidOutput: string,
    issues: string[],
  ): Promise<ProviderResult<GeneratedStory>> {
    return this.request(prompt, [
      { role: 'user', content: prompt.user },
      { role: 'assistant', content: invalidOutput.slice(0, 8000) },
      { role: 'user', content: buildRepairPrompt(prompt, invalidOutput, issues) },
    ]);
  }

  private async request(
    prompt: BuiltPrompt,
    messages: Anthropic.MessageParam[],
  ): Promise<ProviderResult<GeneratedStory>> {
    const startedAt = Date.now();

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: prompt.maxOutputTokens,
        system: prompt.system,
        messages,
        tools: [
          {
            name: 'submit_story',
            description: 'Tamamlanmış masalı yapılandırılmış biçimde gönder.',
            input_schema: prompt.responseSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_story' },
      });
    } catch (error) {
      throw toProviderError(error);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new ProviderError('Model did not call submit_story', 'invalid_response');
    }

    const parsed = generatedStorySchema.safeParse(toolUse.input);
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
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      return new ProviderError('Anthropic rate limit', 'rate_limited', { cause: error });
    }
    if (error.status === 401 || error.status === 403) {
      return new ProviderError('Anthropic rejected the API key', 'unauthorized', {
        cause: error,
      });
    }
    if (error.status !== undefined && error.status >= 500) {
      return new ProviderError('Anthropic unavailable', 'unavailable', { cause: error });
    }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderError('Anthropic request timed out', 'timeout', { cause: error });
  }
  return new ProviderError('Anthropic request failed', 'unknown', { cause: error });
}
