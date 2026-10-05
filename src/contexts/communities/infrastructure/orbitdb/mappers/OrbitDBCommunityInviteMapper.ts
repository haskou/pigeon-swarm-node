import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';

import { OrbitDBCommunityInviteDocument } from '../documents/OrbitDBCommunityInviteDocument';

/** Signed payload of an invite: the stored document minus its proof. */
export type OrbitDBCommunityInvitePayload = Omit<
  OrbitDBCommunityInviteDocument,
  'proof'
>;

export default class OrbitDBCommunityInviteMapper {
  public toPayload(invite: CommunityInvite): OrbitDBCommunityInvitePayload {
    const primitives = invite.toPrimitives();

    return {
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      ...(primitives.encryptedCommunityKey && {
        encryptedCommunityKey: primitives.encryptedCommunityKey,
      }),
      ...(primitives.expiresAt !== undefined && {
        expiresAt: primitives.expiresAt,
      }),
      id: primitives.token,
      maxUses: primitives.maxUses,
      nonce: primitives.nonce,
      scopeType: 'community_invite',
      token: primitives.token,
    };
  }

  public toDomain(
    document: OrbitDBCommunityInvitePayload | OrbitDBCommunityInviteDocument,
  ): CommunityInvite {
    return CommunityInvite.fromPrimitives({
      communityId: document.communityId,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      encryptedCommunityKey: document.encryptedCommunityKey,
      expiresAt: document.expiresAt,
      maxUses: document.maxUses,
      nonce: document.nonce,
      token: document.token,
    });
  }
}
