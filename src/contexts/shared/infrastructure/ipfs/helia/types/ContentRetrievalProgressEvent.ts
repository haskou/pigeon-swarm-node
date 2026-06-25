import { ContentRetrievalOptions } from './ContentRetrievalOptions';

export type ContentRetrievalProgressEvent = Parameters<
  NonNullable<ContentRetrievalOptions['onProgress']>
>[0];
