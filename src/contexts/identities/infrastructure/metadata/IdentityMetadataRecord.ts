import { Identity } from '../../domain/Identity';

export interface IdentityMetadataRecord {
  cid: string;
  handle?: string;
  identity?: Identity;
  identityId: string;
  networkId?: string;
  networkIds?: string[];
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
