export interface OrbitDBKeychainMetadataDocument extends Record<
  string,
  unknown
> {
  cid: string;
  deleted?: boolean;
  encryptedPayload?: string;
  id: string;
  networkIds?: string[];
  ownerIdentityId: string;
  previousCid: string | undefined;
  receivedAt: number;
  signature?: string;
  timestamp?: number;
  version: number;
}
