import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { OrbitDBInstance } from './OrbitDBInstance';

export type OrbitDBCore = {
  Documents(options?: { indexBy?: string }): unknown;
  IPFSAccessController(options?: { write?: string[] }): unknown;
  createOrbitDB(options: {
    directory: string;
    id: string;
    ipfs: HeliaInstance;
  }): Promise<OrbitDBInstance>;
};
