import type * as HeliaCore from 'helia';

export type HeliaBlockBrokers = NonNullable<
  Parameters<typeof HeliaCore.createHelia>[0]['blockBrokers']
>;
