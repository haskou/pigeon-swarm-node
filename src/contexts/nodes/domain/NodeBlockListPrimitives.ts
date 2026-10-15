/** The owner-signed block list document, exactly as the owner's client signed it. */
export interface NodeBlockListPrimitives {
  blockedIdentityIds: string[];
  blockedNodePeerIds: string[];
  identitySignature: string;
  issuedAt: number;
  ownerIdentityId: string;
  type: string;
  version: number;
}
