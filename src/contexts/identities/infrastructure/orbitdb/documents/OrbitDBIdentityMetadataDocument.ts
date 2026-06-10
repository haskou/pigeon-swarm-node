import { IdentityMetadataRecord } from '@app/contexts/identities/domain/repositories/types/IdentityMetadataRecord';

export interface OrbitDBIdentityMetadataDocument
  extends IdentityMetadataRecord, Record<string, unknown> {
  deleted?: boolean;
  id: string;
  networkId?: string;
}
