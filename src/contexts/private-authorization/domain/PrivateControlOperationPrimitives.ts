export interface PrivateControlOperationPrimitives {
  authorDeviceKey: string;
  authorizationRevision: number;
  byteSize: number;
  digest: string;
  id: string;
  kind: 'membership.propose' | 'membership.commit' | 'device.revoke' | string;
  mutation:
    | { targetIdentityId: string; type: 'member.ban' }
    | { deviceKey: string; type: 'device.revoke' }
    | Record<string, unknown>;
  previousOperationIds: string[];
  proposalOperationId?: string;
  scopeId: string;
}
