export interface NodeBlockSourcePendingResource {
  blockedIdentityIds: string[];
  blockedNodePeerIds: string[];
  ownerIdentityId: string;
  version: number | null;
}
