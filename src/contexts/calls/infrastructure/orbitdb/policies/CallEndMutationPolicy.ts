import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CallRecordIds } from '../../../domain/CallRecordIds';
import { CallRecordClock } from './CallRecordClock';

/**
 * An end is signed by the identity that ends the call: the creator, or any
 * participant of a conversation call. A community call is ended by its creator
 * only; everybody else leaves it.
 */
export default class CallEndMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['callId', 'endedByIdentityId', 'id'],
    ['at'],
    'call_end',
  );

  public readonly collection = 'calls';

  public readonly scopeType = 'call_end';

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (
      record.removed !== undefined ||
      record.id !== CallRecordIds.end(record.callId as string)
    ) {
      throw new InvalidPublicMutationError();
    }

    try {
      new IdentityId(record.endedByIdentityId as string);
      CallRecordClock.assertNotInFuture(record.at);
    } catch {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: record.endedByIdentityId as string,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion || record.endedByIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    const [start] = await this.registry.queryDocuments(
      this.collection,
      (document) =>
        document.scopeType === 'call_start' &&
        document.id === CallRecordIds.start(record.callId as string),
    );

    if (!start) throw new InvalidPublicMutationError();

    const isCreator = start.creatorIdentityId === authorIdentityId;
    const isConversation =
      (start.scope as Record<string, unknown>).type === 'conversation';

    if (
      !isCreator &&
      !(
        isConversation &&
        (start.participantIds as string[]).includes(authorIdentityId)
      )
    ) {
      throw new InvalidPublicMutationError();
    }
  }
}
