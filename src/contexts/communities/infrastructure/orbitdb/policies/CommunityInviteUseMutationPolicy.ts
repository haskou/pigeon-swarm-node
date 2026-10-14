import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Community } from '../../../domain/Community';
import { CommunityInviteNotFoundError } from '../../../domain/errors/CommunityInviteNotFoundError';
import { CommunityNotFoundError } from '../../../domain/errors/CommunityNotFoundError';
import CommunityInviteRepository from '../../../domain/repositories/CommunityInviteRepository';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

export default class CommunityInviteUseMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['communityId', 'id', 'identityId', 'token'],
    ['usedAt'],
    'community_invite_use',
  );

  private readonly communities = new ShortLivedLookup<Community>();

  public readonly collection = 'requests';

  public readonly scopeType = 'community_invite_use';

  public readonly requiresFrontier = true;

  constructor(
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
    private readonly inviteRepository: CommunityInviteRepository,
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

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const id = `invite-use:${record.token as string}:${record.identityId as string}`;

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: record.identityId as string,
      recordId: id,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    _isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    const invite = await this.inviteRepository
      .requireByToken(new CommunityInviteToken(record.token as string))
      .catch((error: unknown) => {
        if (error instanceof CommunityInviteNotFoundError) {
          throw new InvalidPublicMutationError();
        }

        throw error;
      });

    if (
      invite.getCommunityId().valueOf() !== record.communityId ||
      invite.isExpired(new Timestamp(record.usedAt as number))
    ) {
      throw new InvalidPublicMutationError();
    }

    const community = await this.findCommunity(record, frontier);
    community.requestMembership(new IdentityId(authorIdentityId));
  }
}
