import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import PollMutationRecords from '../PollMutationRecords';
import PollMutationScopeAccess from './PollMutationScopeAccess';

/** A poll definition, authored and signed by its creator. */
export default class PollMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['creatorIdentityId', 'id', 'question'],
    ['createdAt'],
    PollMutationRecords.POLL,
    {
      arrays: ['options'],
      booleans: ['allowsMultipleVotes'],
      optionalIntegers: ['expiresAt'],
      optionalStrings: PollMutationRecords.SCOPE_FIELDS,
    },
  );

  public readonly collection = 'polls';

  public readonly scopeType = PollMutationRecords.POLL;

  constructor(private readonly access: PollMutationScopeAccess) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const poll = PollMutationRecords.pollOf(record);

    return {
      authorIdentityId: poll.getCreatorIdentityId().valueOf(),
      recordId: poll.getId().valueOf(),
      store: this.collection,
    };
  }

  public assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    return this.access.assertCanManage(
      PollMutationRecords.scopeOf(record),
      authorIdentityId,
    );
  }
}
