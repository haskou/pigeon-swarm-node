export interface PrivateControlOperationPrimitives {
  authorDeviceKey: string;
  authorIdentityId: string;
  authorizationRevision: number;
  byteSize: number;
  control?: Record<string, unknown>;
  digest: string;
  id: string;
  identityAuthorizationRevision: number;
  kind: 'membership.propose' | 'membership.commit' | 'device.revoke' | string;
  mutation:
    | { targetIdentityId: string; type: 'member.ban' }
    | { targetIdentityId: string; type: 'member.remove' }
    | {
        deviceKey: string;
        identityId: string;
        identityAuthorizationRevision: number;
        mlsCredentialHash: string;
        type: 'member.admit';
      }
    | {
        roleIds: string[];
        targetIdentityId: string;
        type: 'member.roles.set';
      }
    | { deviceKey: string; type: 'device.revoke' }
    | Record<string, unknown>;
  previousOperationIds: string[];
  proposalOperationId?: string;
  scopeId: string;
}
