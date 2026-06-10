import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';

import { OrbitDBCommunityMembershipRequestDocument } from '../documents/OrbitDBCommunityMembershipRequestDocument';

export default class OrbitDBCommunityMembershipRequestMapper {
  public toDocument(
    request: CommunityMembershipRequest,
  ): OrbitDBCommunityMembershipRequestDocument {
    const primitives = request.toPrimitives();

    return {
      communityId: primitives.communityId,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      id: primitives.id,
      identityId: primitives.identityId,
      kind: 'community_membership_request',
      status: primitives.status,
      type: primitives.type,
      updatedAt: primitives.updatedAt,
    };
  }

  public toDomain(
    document: OrbitDBCommunityMembershipRequestDocument,
  ): CommunityMembershipRequest {
    return CommunityMembershipRequest.fromPrimitives({
      communityId: document.communityId,
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      id: document.id,
      identityId: document.identityId,
      status: document.status,
      type: document.type,
      updatedAt: document.updatedAt,
    });
  }
}
