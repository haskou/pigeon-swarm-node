export interface PrivateAuthorizationCheckpointPrimitives {
  admittedDeviceKeys: string[];
  authorityKeys: string[];
  controlCheckpointJson: string;
  deviceIdentities: Array<{ deviceKey: string; identityId: string }>;
  freshnessAuthorityKey: string;
  headHash: string;
  parentHeadHash: string | null;
  revision: number;
  revokedDeviceKeys: string[];
  scopeId: string;
}
