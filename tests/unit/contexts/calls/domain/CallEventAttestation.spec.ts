import { Call } from '@app/contexts/calls/domain/Call';
import { CallEventAttestation } from '@app/contexts/calls/domain/CallEventAttestation';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallEndedEvent } from '@app/contexts/calls/domain/events/CallEndedEvent';
import { CallParticipantJoinedEvent } from '@app/contexts/calls/domain/events/CallParticipantJoinedEvent';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';

import { callStartArgs } from '../../../../support/signCall';

const creator = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const callee = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);

function newCall(): Call {
  return Call.start(
    creator,
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
    CallScope.conversation(new ConversationId('one-to-one:attest')),
    [callee],
    ...callStartArgs(),
  );
}

describe('CallEventAttestation', () => {
  it('attests a started event only while the local call is active', () => {
    const call = newCall();
    const [started] = call.pullDomainEvents();

    expect(started).toBeInstanceOf(CallStartedEvent);
    expect(CallEventAttestation.attest(started, call)).toBeInstanceOf(
      CallStartedEvent,
    );

    call.end(creator, new Timestamp(1_770_000_001_000));

    expect(CallEventAttestation.attest(started, call)).toBeUndefined();
  });

  it('rebuilds the event from local state instead of trusting the claimed attributes', () => {
    const call = newCall();
    const [started] = call.pullDomainEvents();
    const forged = new CallStartedEvent(
      started.aggregateId,
      { ...started.attributes, participantIds: ['victim'] },
      started.eventId,
      started.occurredOn,
    );
    const attested = CallEventAttestation.attest(forged, call)!;

    expect(attested.attributes.participantIds).toEqual(
      call.toEventAttributes().participantIds,
    );
  });

  it('rejects an event of another call', () => {
    const call = newCall();
    const other = newCall();
    const [started] = other.pullDomainEvents();

    expect(CallEventAttestation.attest(started, call)).toBeUndefined();
  });

  it('attests an ended event only for an ended call', () => {
    const call = newCall();
    const claim = new CallEndedEvent(
      call.getId().valueOf(),
      call.toEventAttributes(),
    );

    expect(CallEventAttestation.attest(claim, call)).toBeUndefined();
    call.end(creator, new Timestamp(1_770_000_001_000));
    expect(CallEventAttestation.attest(claim, call)).toBeInstanceOf(
      CallEndedEvent,
    );
  });

  it('attests a participant event only when that participant holds the claimed state', () => {
    const call = newCall();
    const claim = new CallParticipantJoinedEvent(call.getId().valueOf(), {
      ...call.toEventAttributes(),
      joinedIdentityId: callee.valueOf(),
    });

    expect(CallEventAttestation.attest(claim, call)).toBeUndefined();
    call.join(callee, new Timestamp(1_770_000_001_000));
    expect(CallEventAttestation.attest(claim, call)).toBeInstanceOf(
      CallParticipantJoinedEvent,
    );
  });

  it('recognises lifecycle events and ignores others', () => {
    const call = newCall();
    const [started] = call.pullDomainEvents();

    expect(CallEventAttestation.isLifecycleEvent(started)).toBe(true);
  });
});
