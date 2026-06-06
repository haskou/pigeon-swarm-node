import type { MemoryDatastore } from 'datastore-core';
import type { FsDatastore } from 'datastore-fs';

export type RuntimeDatastore = FsDatastore | MemoryDatastore;
