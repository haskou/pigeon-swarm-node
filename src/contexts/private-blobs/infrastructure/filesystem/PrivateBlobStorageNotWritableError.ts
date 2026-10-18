/**
 * Carries the env var name and an errno code only. The OS message would name
 * the resolved storage path, which must never reach the logs.
 */
export class PrivateBlobStorageNotWritableError extends Error {
  constructor(code: string) {
    super(
      `PRIVATE_BLOB_STORAGE_PATH is not writable (${code}): private blob uploads would fail, point it at a writable directory`,
    );
    this.name = 'PrivateBlobStorageNotWritableError';
  }
}
