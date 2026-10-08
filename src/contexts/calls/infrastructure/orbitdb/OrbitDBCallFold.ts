import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { CallSessionEpoch } from '@app/contexts/calls/domain/value-objects/CallSessionEpoch';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';

import { CallRecords } from './CallRecords';
import { FoldedCall } from './FoldedCall';

/**
 * Derives the state of a call from its signed records only. Same records in
 * any arrival order fold to the same call: events apply sorted by their
 * claimed time and record id, never by when they arrived.
 */
export class OrbitDBCallFold {
  private static epochOf(
    start: Record<string, unknown>,
  ): CallSessionEpoch | undefined {
    return start.sessionEpoch === undefined
      ? undefined
      : new CallSessionEpoch(start.sessionEpoch as number);
  }

  private static apply(call: Call, records: CallRecords): void {
    const events = [
      ...(call.getScope().isConversation()
        ? [...records.participants.values()]
        : []),
      ...(records.end ? [records.end] : []),
    ].sort(
      (left, right) =>
        (left.at as number) - (right.at as number) ||
        (left.id as string).localeCompare(right.id as string),
    );

    for (const event of events) {
      try {
        OrbitDBCallFold.applyEvent(call, event);
      } catch {
        // An event that does not apply to the state reached so far is inert.
      }
    }
  }

  private static applyEvent(call: Call, event: Record<string, unknown>): void {
    const at = new Timestamp(event.at as number);

    if (event.scopeType === 'call_end') {
      call.endFromRecord(new IdentityId(event.endedByIdentityId as string), at);

      return;
    }

    const identityId = new IdentityId(event.identityId as string);

    if (event.state === 'joined') {
      call.join(identityId, at);

      return;
    }

    if (event.state === 'left') {
      // The left record replaces the joined one of the same participant, so the
      // join it follows (required by the policy) is implied.
      try {
        call.join(identityId, at);
      } catch {
        // Already joined or not joinable: the leave below decides.
      }
    }

    call.leave(identityId, at);
  }

  public static fold(
    records: CallRecords,
    timedOutAt?: number,
  ): FoldedCall | undefined {
    const start = records.start;

    if (!start) return undefined;

    try {
      const scope = CallScope.fromPrimitives(
        start.scope as ReturnType<CallScope['toPrimitives']>,
      );
      const call = Call.start(
        new IdentityId(start.creatorIdentityId as string),
        new NetworkId(start.networkId as string),
        scope,
        (start.participantIds as string[]).map((id) => new IdentityId(id)),
        new CallNonce(start.nonce as string),
        new Timestamp(start.startedAt as number),
        OrbitDBCallFold.epochOf(start),
      );

      OrbitDBCallFold.apply(call, records);

      if (timedOutAt !== undefined && call.isActive()) {
        call.markTimedOut(new Timestamp(timedOutAt));
      }

      const primitives = call.toPrimitives();

      return {
        digest:
          PublicMutationRecord.proofOf(start)?.getBody().payloadDigest ?? '',
        primitives: scope.isCommunityChannel()
          ? { ...primitives, participantIds: [], participants: [] }
          : primitives,
      };
    } catch {
      return undefined;
    }
  }
}
