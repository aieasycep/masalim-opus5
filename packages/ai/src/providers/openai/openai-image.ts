import OpenAI, { toFile } from 'openai';
import { buildStylePrompt } from '../../style-templates';
import type {
  GeneratedImage,
  ImageGenerationInput,
  ImageGenerationProvider,
  ProviderResult,
} from '../../types';
import { ProviderError } from '../../types';
import { toProviderError } from './openai-story';

export interface OpenAIImageOptions {
  apiKey: string;
  model: string;
  /** Whether to feed the cover back in as a reference for later pages. */
  useReferenceImages: boolean;
  timeoutMs?: number;
}

/**
 * Illustration via gpt-image-1.
 *
 * Reference images are the reason this provider was chosen: the generated cover
 * is passed back in for every subsequent page, which is what actually keeps the
 * hero recognisable across a whole book. Prompt-only consistency drifts by page
 * four no matter how carefully the character is described.
 */
export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = 'openai';
  readonly supportsReferenceImages: boolean;

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIImageOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 180_000,
      maxRetries: 2,
    });
    this.model = options.model;
    this.supportsReferenceImages = options.useReferenceImages;
  }

  async generateImage(
    input: ImageGenerationInput,
  ): Promise<ProviderResult<GeneratedImage>> {
    const startedAt = Date.now();
    const prompt = buildStylePrompt(input.style, input.prompt, input.characterBible);
    const size = input.aspect === 'square' ? '1024x1024' : '1536x1024';

    try {
      const response =
        this.supportsReferenceImages && input.referenceImage
          ? await this.client.images.edit({
              model: this.model,
              image: await toFile(input.referenceImage, 'reference.png', {
                type: 'image/png',
              }),
              prompt: `${prompt}\n\nKeep the character's appearance identical to the reference image.`,
              size,
            })
          : await this.client.images.generate({
              model: this.model,
              prompt,
              size,
              quality: 'high',
            });

      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) {
        throw new ProviderError('Image response contained no data', 'invalid_response');
      }

      return {
        data: {
          data: Buffer.from(encoded, 'base64'),
          contentType: 'image/png',
        },
        usage: {
          provider: this.name,
          model: this.model,
          imageCount: 1,
          latencyMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw toProviderError(error);
    }
  }
}
