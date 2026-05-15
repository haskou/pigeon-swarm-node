import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallEndedEvent } from '@app/contexts/calls/domain/events/CallEndedEvent';
import { CallMissedEvent } from '@app/contexts/calls/domain/events/CallMissedEvent';
import { CallParticipantDeclinedEvent } from '@app/contexts/calls/domain/events/CallParticipantDeclinedEvent';
import { CallParticipantJoinedEvent } from '@app/contexts/calls/domain/events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from '@app/contexts/calls/domain/events/CallParticipantLeftEvent';
import { CallParticipantMissedEvent } from '@app/contexts/calls/domain/events/CallParticipantMissedEvent';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { InactiveCallError } from '@app/contexts/calls/domain/errors/InactiveCallError';
import { CallParticipantNotFoundError } from '@app/contexts/calls/domain/errors/CallParticipantNotFoundError';
import { CallSignalType } from '@app/contexts/calls/domain/value-objects/CallSignalType';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';

describe('Call', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const lateParticipant = new IdentityId(
    'MCowBQYDK2VwAyEACQNoYYTvUcCZYb3jBDUqqp/ZrcLEhWy0pYsEZ1kkgJg=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
  const scope = CallScope.conversation(
    new ConversationId('one-to-one:call-test'),
  );

  it('should start a call and emit a started event', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);
    const primitives = call.toPrimitives();

    expect(primitives.status).toBe('active');
    expect(primitives.participantIds).toEqual([
      creator.valueOf(),
      recipient.valueOf(),
    ]);
    expect(primitives.participants).toMatchObject([
      { identityId: creator.valueOf(), status: 'joined' },
      { identityId: recipient.valueOf(), status: 'ringing' },
    ]);
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(CallStartedEvent);
  });

  it('should emit a joined event for an invited participant', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.join(recipient);

    expect(call.toPrimitives().participantIds).toEqual([
      creator.valueOf(),
      recipient.valueOf(),
    ]);
    const events = call.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CallParticipantJoinedEvent);
  });

  it('should add and join a late participant', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.joinOrAdd(lateParticipant);

    expect(call.toPrimitives().participants).toMatchObject([
      { identityId: creator.valueOf(), status: 'joined' },
      { identityId: recipient.valueOf(), status: 'ringing' },
      { identityId: lateParticipant.valueOf(), status: 'joined' },
    ]);
    const events = call.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CallParticipantJoinedEvent);
    expect(events[0].attributes).toMatchObject({
      joinedIdentityId: lateParticipant.valueOf(),
      participantIds: [
        creator.valueOf(),
        recipient.valueOf(),
        lateParticipant.valueOf(),
      ],
    });
  });

  it('should not emit a joined event when the participant is already joined', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.joinOrAdd(creator);

    expect(call.pullDomainEvents()).toHaveLength(0);
  });

  it('should send a signal between participants', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.sendSignal(
      creator,
      recipient,
      new CallSignalType('offer'),
      { sdp: 'offer-sdp' },
    );

    const events = call.pullDomainEvents();

    expect(events[0]).toBeInstanceOf(CallSignalSentEvent);
    expect(events[0].attributes).toMatchObject({
      payload: { sdp: 'offer-sdp' },
      recipientIdentityId: recipient.valueOf(),
      senderIdentityId: creator.valueOf(),
      signalType: 'offer',
    });
  });

  it('should end a call and reject more signals', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.end(creator);

    expect(call.toPrimitives().status).toBe('ended');
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(CallEndedEvent);
    expect(() =>
      call.sendSignal(
        creator,
        recipient,
        new CallSignalType('answer'),
        { sdp: 'answer-sdp' },
      ),
    ).toThrow(InactiveCallError);
  });

  it('should reject ending an active call by a declined participant', () => {
    const call = Call.start(creator, networkId, scope, [
      recipient,
      lateParticipant,
    ]);

    call.pullDomainEvents();
    call.join(recipient);
    call.pullDomainEvents();
    call.leave(lateParticipant);

    expect(call.toPrimitives().status).toBe('active');
    expect(() => call.end(lateParticipant)).toThrow(
      CallParticipantNotFoundError,
    );
    expect(call.toPrimitives().status).toBe('active');
  });

  it('should emit participant declined events for ringing participants', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.leave(recipient);

    expect(call.toPrimitives().participants).toMatchObject([
      { identityId: creator.valueOf(), status: 'joined' },
      { identityId: recipient.valueOf(), status: 'declined' },
    ]);
    expect(call.toPrimitives().status).toBe('missed');
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(
      CallParticipantDeclinedEvent,
    );
  });

  it('should emit participant leave events for joined participants', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    call.join(recipient);
    call.pullDomainEvents();
    call.leave(recipient);

    expect(call.toPrimitives().participants).toMatchObject([
      { identityId: creator.valueOf(), status: 'joined' },
      { identityId: recipient.valueOf(), status: 'left' },
    ]);
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(CallParticipantLeftEvent);
  });

  it('should mark ringing participants as missed', () => {
    const call = Call.start(creator, networkId, scope, [recipient]);

    call.pullDomainEvents();
    const missedParticipants = call.markTimedOut(new Timestamp(1770000000000));
    const events = call.pullDomainEvents();

    expect(missedParticipants).toEqual([recipient]);
    expect(call.toPrimitives()).toMatchObject({
      status: 'missed',
      participants: [
        { identityId: creator.valueOf(), status: 'joined' },
        {
          identityId: recipient.valueOf(),
          missedAt: 1770000000000,
          status: 'missed',
        },
      ],
    });
    expect(events[0]).toBeInstanceOf(CallParticipantMissedEvent);
    expect(events[1]).toBeInstanceOf(CallMissedEvent);
  });

  it('should keep an active group call alive when only ringing invitees timeout', () => {
    const call = Call.start(creator, networkId, scope, [
      recipient,
      lateParticipant,
    ]);

    call.pullDomainEvents();
    call.join(recipient);
    call.pullDomainEvents();
    const missedParticipants = call.markTimedOut(
      new Timestamp(1770000000000),
    );
    const events = call.pullDomainEvents();

    expect(missedParticipants).toEqual([lateParticipant]);
    expect(call.toPrimitives()).toMatchObject({
      status: 'active',
      participants: [
        { identityId: creator.valueOf(), status: 'joined' },
        { identityId: recipient.valueOf(), status: 'joined' },
        {
          identityId: lateParticipant.valueOf(),
          missedAt: 1770000000000,
          status: 'missed',
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CallParticipantMissedEvent);
  });
});
