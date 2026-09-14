import type { AssetKind } from '@masalim/types';
import { ApiError } from './errors';
import type { Endpoints } from './endpoints';

export interface UploadFileParams {
  /** A local file URI from the recorder or the image picker. */
  uri: string;
  kind: AssetKind;
  contentType: string;
  onProgress?: (fraction: number) => void;
}

/**
 * Uploads a local file and returns the asset id.
 *
 * Three steps, in this order, because each one guards the next: the server
 * issues a signed URL and records the asset; the bytes go straight to storage
 * without passing through the API; the API then confirms the object landed and
 * re-checks its real size. A client that skipped the confirmation would leave an
 * asset the retention job later sweeps, which is the desired failure — better a
 * dangling row than a voice recording nobody knows about.
 *
 * The file is read *before* the signed URL is requested so the size quoted to
 * the server is the file's actual size. Taking a caller's figure would mean
 * every call site computing the length of a recording it just made, and a wrong
 * guess would fail the upload at the storage layer with nothing useful to show
 * the parent.
 */
export async function uploadFile(endpoints: Endpoints, params: UploadFileParams): Promise<string> {
  const body = await readLocalFile(params.uri);

  const signed = await endpoints.uploads.request(params.kind, params.contentType, body.size);

  params.onProgress?.(0.1);

  const response = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { ...signed.headers, 'Content-Type': params.contentType },
    body,
  }).catch((error: unknown) => {
    throw ApiError.network(error);
  });

  if (!response.ok) {
    throw new ApiError({
      code: 'UPLOAD_FAILED',
      status: response.status,
      message: 'The upload did not complete',
    });
  }

  params.onProgress?.(0.9);

  const confirmed = await endpoints.uploads.confirm(signed.assetId);
  params.onProgress?.(1);

  return confirmed.assetId;
}

/**
 * Reads a `file://` URI into a blob.
 *
 * React Native's `fetch` handles local file URIs, which avoids pulling the whole
 * recording through base64 — a sixty-second WAV is several megabytes, and
 * base64 would inflate it by a third and stall the JS thread while it did.
 */
async function readLocalFile(uri: string): Promise<Blob> {
  const response = await fetch(uri).catch((error: unknown) => {
    throw ApiError.network(error);
  });

  if (!response.ok) {
    throw new ApiError({
      code: 'UPLOAD_FAILED',
      status: response.status,
      message: 'The recording could not be read from the device',
    });
  }

  return response.blob();
}
