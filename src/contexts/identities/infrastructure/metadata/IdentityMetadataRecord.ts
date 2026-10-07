import { Identity } from '../../domain/Identity';

export interface IdentityMetadataRecord {
  cid: string;
  handle?: string;
  identity: Identity;
  identityId: string;
  networkIds?: string[];
  previousCid: string | undefined;
  version: number;
}
