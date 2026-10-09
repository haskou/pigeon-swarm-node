import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

import PollMutationRecords from '../PollMutationRecords';
import PollMutationScopeAccess from './PollMutationScopeAccess';

/** The record that closes a poll, signed by whoever may manage polls there. */
export default class PollCloseMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['closedByIdentityId', 'id', 'pollId'],
    ['createdAt'],
    PollMutationRecords.CLOSE,
    {
      optionalStrings: PollMutationRecords.SCOPE_FIELDS,
    },
  );

  public readonly collection = 'polls';

  public readonly scopeType = PollMutationRecords.CLOSE;

  public readonly requiresFrontier = true;

  constructor(private readonly access: PollMutationScopeAccess) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    const close = PollMutationRecords.closeOf(record);

    return {
      authorIdentityId: close.closedByIdentityId,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    _isDeletion: boolean,
    frontier: string[],
  ): Promise<void> {
    return this.access.assertCanManage(
      PollMutationRecords.scopeOf(record),
      frontier,
      authorIdentityId,
    );
  }
}
