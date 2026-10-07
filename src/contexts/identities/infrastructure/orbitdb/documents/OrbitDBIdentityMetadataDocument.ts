import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';

export interface OrbitDBIdentityMetadataDocument extends Record<
  string,
  unknown
> {
  cid: string;
  handle?: string;
  id: string;
  identity: IdentityPrimitives;
  identityId: string;
  networkIds?: string[];
  previousCid: string | undefined;
  version: number;
}
