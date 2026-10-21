import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';
import { PublicMutationFrontier } from '@app/contexts/public-mutations/domain/PublicMutationFrontier';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { CommunityModerationLogEntry } from '../../../domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityNotFoundError } from '../../../domain/errors/CommunityNotFoundError';
import { CommunityOperationParentsMissingError } from '../../../domain/errors/CommunityOperationParentsMissingError';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityModerationAction } from '../../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationLogId } from '../../../domain/value-objects/CommunityModerationLogId';
import OrbitDBCommunityRepository from '../OrbitDBCommunityRepository';

/**
 * Moderation log entries are immutable audit records: only the actor can sign
 * their own entry, only while holding the permission the action requires, and
 * they can never be removed.
 */
export default class CommunityModerationLogMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['action', 'actorIdentityId', 'communityId', 'id'],
    ['createdAt'],
    'community_moderation_log',
    { objects: ['details', 'target'] },
  );

  private readonly communities = new ShortLivedLookup<Community>();

  public readonly collection = 'moderationLogs';

  public readonly scopeType = 'community_moderation_log';

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
        if (
          error instanceof CommunityNotFoundError ||
          error instanceof CommunityOperationParentsMissingError
        ) {
          throw new PublicMutationPendingError();
        }

        throw error;
      });
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    try {
      const entry = CommunityModerationLogEntry.fromPrimitives(
        record as Parameters<
          typeof CommunityModerationLogEntry.fromPrimitives
        >[0],
      );
      const { action, actorIdentityId, communityId, createdAt, id, target } =
        entry.toPrimitives();
      const derived = CommunityModerationLogId.derive(
        communityId,
        actorIdentityId,
        action,
        target.type,
        target.id,
        createdAt,
      ).valueOf();

      if (id !== derived) throw new InvalidPublicMutationError();

      return {
        authorIdentityId: actorIdentityId,
        recordId: derived,
        store: this.collection,
      };
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    _isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    const community = await this.findCommunity(record, frontier);
    community.assertCanRecordModerationAction(
      new IdentityId(authorIdentityId),
      new CommunityModerationAction(record.action as string),
      record.details as Record<string, unknown>,
    );
  }
}
