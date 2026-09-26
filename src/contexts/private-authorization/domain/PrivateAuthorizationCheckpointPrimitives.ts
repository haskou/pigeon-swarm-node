export interface PrivateAuthorizationCheckpointPrimitives {
  admittedDeviceKeys: string[];
  authorityKeys: string[];
  headHash: string;
  parentHeadHash: string | null;
  revision: number;
  revokedDeviceKeys: string[];
  scopeId: string;
}
