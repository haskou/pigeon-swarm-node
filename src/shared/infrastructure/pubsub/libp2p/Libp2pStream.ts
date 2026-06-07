export type Libp2pStream = AsyncIterable<
  Uint8Array | { subarray(): Uint8Array }
> & {
  close(options?: { signal?: AbortSignal }): Promise<void>;
  send(data: Uint8Array): boolean;
  onDrain?(options?: { signal?: AbortSignal }): Promise<void>;
};
