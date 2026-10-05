import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import PollMutationRecords from '../PollMutationRecords';
import PollMutationScopeAccess from './PollMutationScopeAccess';

/** A voter's ballot (or its tombstone), one record per voter and poll. */
export default class PollVoteMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'pollId', 'voterIdentityId'],
    ['createdAt'],
    PollMutationRecords.VOTE,
    {
      arrays: ['optionIds'],
      optionalStrings: PollMutationRecords.SCOPE_FIELDS,
    },
  );

  public readonly collection = 'polls';

  public readonly scopeType = PollMutationRecords.VOTE;

  constructor(private readonly access: PollMutationScopeAccess) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const vote =
      record.removed === true
        ? PollMutationRecords.voteTombstoneOf(record)
        : PollMutationRecords.voteOf(record);

    if (record.removed !== undefined && record.removed !== true) {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: vote.voterIdentityId,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion) return;

    await this.access.assertCanVote(
      PollMutationRecords.scopeOf(record),
      authorIdentityId,
    );
  }
}
