import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityMembershipRequest } from '../../../domain/entities/membership/CommunityMembershipRequest';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

export default class CommunityMembershipRequestMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['communityId', 'creatorIdentityId', 'id', 'identityId', 'status', 'type'],
    ['createdAt', 'updatedAt'],
    'community_membership_request',
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'requests';

  public readonly scopeType = 'community_membership_request';

  public readonly requiresFrontier = true;

  constructor(
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
  ) {
    super();
  }

  private toRequest(
    record: Record<string, unknown>,
  ): CommunityMembershipRequest {
    try {
      return CommunityMembershipRequest.fromPrimitives(
        record as Parameters<
          typeof CommunityMembershipRequest.fromPrimitives
        >[0],
      );
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const request = this.toRequest(record);
    const id = CommunityRequestId.derive(
      record.communityId as string,
      record.type as string,
      record.creatorIdentityId as string,
      record.identityId as string,
      record.createdAt as number,
    ).valueOf();

    if (record.id !== id || request.getId().valueOf() !== id) {
      throw new InvalidPublicMutationError();
    }

    if (request.isRequest() && record.creatorIdentityId !== record.identityId) {
      throw new InvalidPublicMutationError();
    }

    return { recordId: id, store: this.collection };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    _isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    const community = await this.communities.get(
      PublicMutationFrontier.keyOf(record.communityId as string, frontier),
      () =>
        this.communityRepository.findAtFrontier(
          new CommunityId(record.communityId as string),
          frontier,
        ),
    );

    if (!community) throw new InvalidPublicMutationError();
    community.assertMembershipRequestAuthoredBy(
      new IdentityId(authorIdentityId),
      this.toRequest(record),
    );
  }
}
