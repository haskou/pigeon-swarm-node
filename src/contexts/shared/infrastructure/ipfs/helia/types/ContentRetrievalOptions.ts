import type { HeliaUnixfsCatOptions } from '../adapters/types/HeliaUnixfsCatOptions';

export type ContentRetrievalOptions = {
  maxProviders?: number;
  minProviders?: number;
  onProgress?: (event: { detail?: unknown; type: string }) => void;
  providers?: HeliaUnixfsCatOptions['providers'];
  signal?: AbortSignal;
};
