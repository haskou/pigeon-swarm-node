import type { HeliaUnixfsClient } from './HeliaUnixfsClient';

export type HeliaUnixfsCatOptions = NonNullable<
  Parameters<HeliaUnixfsClient['cat']>[1]
> & {
  blockReadConcurrency?: number;
};
