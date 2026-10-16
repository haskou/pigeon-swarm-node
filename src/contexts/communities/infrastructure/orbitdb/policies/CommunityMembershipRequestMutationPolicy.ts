import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityMembershipRequest } from '../../../domain/entities/membership/CommunityMembershipRequest';
import { CommunityNotFoundError } from '../../../domain/errors/CommunityNotFoundError';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRequestId } from '../../../domain/value-objects/CommunityRequestId';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

export default class CommunityMembershipRequestMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['communityId', 'creatorIdentityId', 'id', 'identityId', 'status', 'type'],
    ['createdAt', 'updatedAt'],
    'community_membership_request',
  );

  private readonly communities = new ShortLivedLookup<Community>();

  public readonly collection = 'requests';

  public readonly scopeType = 'community_membership_request';

  public readonly requiresFrontier = true;

  constructor(
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
  ) {
    super();
  }

  private async findCommunity(
    record: Record<string, unknown>,
    frontier: string[],
  ): Promise<Community> {
    const communityId = record.communityId as string;

    return this.communities
      .get(PublicMutationFrontier.keyOf(communityId, frontier), () =>
        this.communityRepository.requireAtFrontier(
          new CommunityId(communityId),
          frontier,
        ),
      )
      .catch((error: unknown) => {
        if (error instanceof CommunityNotFoundError) {
          throw new InvalidPublicMutationError();
        }

        throw error;
      });
  }

  private derivedIdOf(request: CommunityMembershipRequest): string {
    const { communityId, createdAt, creatorIdentityId, identityId } =
      request.toPrimitives();

    try {
      return CommunityRequestId.derive(
        communityId,
        request.getType(),
        creatorIdentityId,
        identityId,
        createdAt,
      ).valueOf();
    } catch {
      throw new InvalidPublicMutationError();
    }
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
    const id = this.derivedIdOf(request);

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
    const community = await this.findCommunity(record, frontier);
    community.assertMembershipRequestAuthoredBy(
      new IdentityId(authorIdentityId),
      this.toRequest(record),
    );
  }
}
