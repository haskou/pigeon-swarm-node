import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';

import { OrbitDBCommunityInviteDocument } from '../documents/OrbitDBCommunityInviteDocument';

export default class OrbitDBCommunityInviteMapper {
  public toDocument(invite: CommunityInvite): OrbitDBCommunityInviteDocument {
    const primitives = invite.toPrimitives();

    return {
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      encryptedCommunityKey: primitives.encryptedCommunityKey,
      expiresAt: primitives.expiresAt,
      id: primitives.token,
      kind: 'community_invite',
      maxUses: primitives.maxUses,
      token: primitives.token,
      uses: primitives.uses,
    };
  }

  public toDomain(document: OrbitDBCommunityInviteDocument): CommunityInvite {
    return CommunityInvite.fromPrimitives({
      communityId: document.communityId,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      encryptedCommunityKey: document.encryptedCommunityKey,
      expiresAt: document.expiresAt,
      maxUses: document.maxUses,
      token: document.token,
      uses: document.uses,
    });
  }
}
