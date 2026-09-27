import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';

export interface OrbitDBIdentityMetadataDocument extends Record<
  string,
  unknown
> {
  cid: string;
  deleted?: boolean;
  handle?: string;
  id: string;
  identity?: IdentityPrimitives;
  identityId: string;
  networkId?: string;
  networkIds?: string[];
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
