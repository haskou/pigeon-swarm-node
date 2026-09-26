export interface VerifiedPrivateControlPolicy {
  authorityKeys: string[];
  devices: Array<{ deviceKey: string; mlsCredentialHash: string }>;
  freshnessAuthorityKey: string;
  leaseRevocationHpkeKey: string;
  leaseRevocationKey: string;
  sequencerKey: string;
  threshold: number;
  version: number;
}
