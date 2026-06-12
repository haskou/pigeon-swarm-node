import { Identity } from '@app/contexts/identities/domain/Identity';
import { PrimitiveOf } from '@haskou/value-objects';

export interface OrbitDBIdentityMetadataDocument extends Record<
  string,
  unknown
> {
  cid: string;
  deleted?: boolean;
  handle?: string;
  id: string;
  identity?: PrimitiveOf<Identity>;
  identityId: string;
  networkId?: string;
  networkIds?: string[];
  previousCid: string | undefined;
  receivedAt: number;
  version: number;
}
