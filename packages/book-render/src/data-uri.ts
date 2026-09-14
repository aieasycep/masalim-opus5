/**
 * Inlines an image for the renderer.
 *
 * The renderer is offline by design, so every image has to travel inside the
 * document. Doing the conversion here keeps that requirement in one place
 * rather than scattered across whoever assembles a book.
 */
export function toDataUri(body: Buffer, contentType: string): string {
  return `data:${contentType};base64,${body.toString('base64')}`;
}
