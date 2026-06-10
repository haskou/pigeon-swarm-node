import { KeychainMetadataRecord } from '@app/contexts/keychains/domain/repositories/types/KeychainMetadataRecord';

export interface OrbitDBKeychainMetadataDocument
  extends KeychainMetadataRecord, Record<string, unknown> {
  deleted?: boolean;
  id: string;
}
