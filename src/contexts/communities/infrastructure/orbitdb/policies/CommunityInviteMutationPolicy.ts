import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityInvite } from '../../../domain/entities/invites/CommunityInvite';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

export default class CommunityInviteMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['communityId', 'creatorIdentityId', 'id', 'nonce', 'token'],
    ['createdAt', 'maxUses'],
    'community_invite',
    {
      optionalIntegers: ['expiresAt'],
      optionalObjects: ['encryptedCommunityKey'],
    },
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'requests';

  public readonly scopeType = 'community_invite';

  constructor(
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
  ) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    try {
      const invite = CommunityInvite.fromPrimitives(
        record as Parameters<typeof CommunityInvite.fromPrimitives>[0],
      );
      const token = CommunityInviteToken.derive(
        record.communityId as string,
        record.creatorIdentityId as string,
        record.nonce as string,
      ).valueOf();

      if (
        record.id !== token ||
        record.token !== token ||
        invite.getToken().valueOf() !== token
      ) {
        throw new InvalidPublicMutationError();
      }

      return {
        authorIdentityId: record.creatorIdentityId as string,
        recordId: token,
        store: this.collection,
      };
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const community = await this.communities.get(
      record.communityId as string,
      () =>
        this.communityRepository.findById(
          new CommunityId(record.communityId as string),
        ),
    );

    if (!community) throw new InvalidPublicMutationError();
    community.assertCanCreateInvite(new IdentityId(authorIdentityId));
  }
}
