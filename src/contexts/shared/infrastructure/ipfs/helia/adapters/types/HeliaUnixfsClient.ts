import type { unixfs as createHeliaUnixfsClient } from '@helia/unixfs';

export type HeliaUnixfsClient = ReturnType<typeof createHeliaUnixfsClient>;
