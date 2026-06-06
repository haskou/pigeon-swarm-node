import type { MemoryBlockstore } from 'blockstore-core';
import type { FsBlockstore } from 'blockstore-fs';

export type RuntimeBlockstore = FsBlockstore | MemoryBlockstore;
