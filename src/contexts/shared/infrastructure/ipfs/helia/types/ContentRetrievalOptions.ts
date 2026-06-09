import type { ProviderOptions } from '@helia/interface/blocks';

export type ContentRetrievalOptions = ProviderOptions & {
  maxProviders?: number;
  minProviders?: number;
  onProgress?: (event: { detail?: unknown; type: string }) => void;
  signal?: AbortSignal;
};
