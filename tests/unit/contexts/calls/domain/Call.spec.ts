import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallParticipantNotFoundError } from '@app/contexts/calls/domain/errors/CallParticipantNotFoundError';
import { InactiveCallError } from '@app/contexts/calls/domain/errors/InactiveCallError';
import { CallEndedEvent } from '@app/contexts/calls/domain/events/CallEndedEvent';
import { CallMissedEvent } from '@app/contexts/calls/domain/events/CallMissedEvent';
import { CallParticipantDeclinedEvent } from '@app/contexts/calls/domain/events/CallParticipantDeclinedEvent';
import { CallParticipantJoinedEvent } from '@app/contexts/calls/domain/events/CallParticipantJoinedEvent';
import { CallParticipantLeftEvent } from '@app/contexts/calls/domain/events/CallParticipantLeftEvent';
import { CallParticipantMissedEvent } from '@app/contexts/calls/domain/events/CallParticipantMissedEvent';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import { CallCapabilityHash } from '@app/contexts/calls/domain/value-objects/CallCapabilityHash';
import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { CallSignalMismatchError } from '@app/contexts/calls/domain/errors/CallSignalMismatchError';
import { CallSignalId } from '@app/contexts/calls/domain/value-objects/CallSignalId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

import { callStartArgs } from '../../../../support/signCall';

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
  const nodeId = new NodeId('9278e9db-bc4d-4a8f-9577-7cad4386512f');
  const signalId = new CallSignalId('68da3440-c60e-4fe3-b86a-2b8931ea345f');
  const scope = CallScope.conversation(
    new ConversationId('one-to-one:call-test'),
  );
  const signalAttributes = {
    createdAt: 1_770_000_000_000,
    expiresAt: 1_770_000_020_000,
    networkId: networkId.valueOf(),
    recipientIdentityId: recipient.valueOf(),
    scopeType: 'conversation',
    sealedEntries: [
      {
        envelope: 'sealed-envelope-for-recipient-device',
        recipientDeviceCredential: 'recipient-device-credential',
      },
    ],
    senderDeviceCredential: 'sender-device-credential',
    senderIdentityId: creator.valueOf(),
    signalId: signalId.valueOf(),
    signalType: 'offer',
    signature: 'ed25519-signature-over-signed-bytes',
  };

  it('should start a call and emit a started event', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );
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
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

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
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

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

  it('exposes joined participants through domain behavior', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.join(recipient);

    expect(call.getJoinedParticipantIds()).toEqual([creator, recipient]);
  });

  it('exposes the community channel id without serializing the call', () => {
    const channelId = new CommunityChannelId('voice-channel');
    const call = Call.start(
      creator,
      networkId,
      CallScope.communityChannel(new CommunityId('community'), channelId),
      [],
      ...callStartArgs(),
    );

    expect(call.getCommunityChannelId()?.isEqual(channelId)).toBe(true);
  });

  it('should not emit a joined event when the participant is already joined', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();
    call.joinOrAdd(creator);

    expect(call.pullDomainEvents()).toHaveLength(0);
  });

  it('should send a signal between participants', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();
    const delivery = call.sendSignal(
      CallSignal.fromPrimitives({
        ...signalAttributes,
        callId: call.getId().valueOf(),
      }),
      nodeId,
    );

    const events = delivery.pullDomainEvents();

    expect(events[0]).toBeInstanceOf(CallSignalSentEvent);
    expect(events[0].attributes).toMatchObject({
      recipientIdentityId: recipient.valueOf(),
      senderIdentityId: creator.valueOf(),
      signalId: signalId.valueOf(),
      signalType: 'offer',
      signature: 'ed25519-signature-over-signed-bytes',
    });
    expect(events[0].attributes).not.toHaveProperty('payload');
  });

  it('should end a call and reject more signals', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();
    call.end(creator);

    expect(call.toPrimitives().status).toBe('ended');
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(CallEndedEvent);
    const answer = CallSignal.fromPrimitives({
      ...signalAttributes,
      callId: call.getId().valueOf(),
      signalType: 'answer',
    });

    expect(() => call.sendSignal(answer, nodeId)).toThrow(InactiveCallError);
  });

  it('should refuse a signal that belongs to another call', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();

    expect(() =>
      call.sendSignal(
        CallSignal.fromPrimitives({
          ...signalAttributes,
          callId: '550e8400-e29b-41d4-a716-446655440009',
        }),
        nodeId,
      ),
    ).toThrow(CallSignalMismatchError);
  });

  it('should reject ending an active call by a declined participant', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient, lateParticipant],
      ...callStartArgs(),
    );

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
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

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
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();
    call.join(recipient);
    call.pullDomainEvents();
    call.leave(recipient);

    expect(call.toPrimitives().participants).toMatchObject([
      { identityId: creator.valueOf(), status: 'joined' },
      { identityId: recipient.valueOf(), status: 'left' },
    ]);
    expect(call.toPrimitives().status).toBe('ended');
    expect(call.pullDomainEvents()[0]).toBeInstanceOf(CallParticipantLeftEvent);
  });

  it('keeps a community session reusable after participants leave', () => {
    const call = Call.start(
      creator,
      networkId,
      CallScope.communityChannel(
        new CommunityId('community'),
        new CommunityChannelId('voice-channel'),
      ),
      [],
      ...callStartArgs(),
    );
    call.joinOrAdd(recipient);
    call.leave(creator);
    expect(call.isActive()).toBe(true);
    call.leave(recipient);
    expect(call.isActive()).toBe(true);
    expect(() => call.joinOrAdd(creator)).not.toThrow();
  });

  describe('a group-capability call', () => {
    const third = new IdentityId(
      'MCowBQYDK2VwAyEAoZUOXZj5HZm3Tb5CEojEXtNLxBIHkE2s28l/FsBICaU=',
    );
    const groupScope = CallScope.groupCapability(
      new CallCapabilityHash(
        BearerCapability.hash('group-call-capability-token'),
      ),
    );
    const startGroup = () => {
      const call = Call.start(
        creator,
        networkId,
        groupScope,
        [],
        ...callStartArgs(),
      );
      call.pullDomainEvents();

      return call;
    };

    it('rings nobody: the node cannot know the group roster', () => {
      const call = Call.start(
        creator,
        networkId,
        groupScope,
        [],
        ...callStartArgs(),
      );

      expect(call.toPrimitives().participants).toEqual([
        expect.objectContaining({
          identityId: creator.valueOf(),
          status: 'joined',
        }),
      ]);
      expect(call.shouldRecordMissedCall()).toBe(false);
    });

    it('names no participant in its events', () => {
      const call = startGroup();
      call.joinOrAdd(recipient);

      expect(call.pullDomainEvents()[0].attributes).toMatchObject({
        participantIds: [],
        participants: [],
        scope: {
          capabilityHash: BearerCapability.hash('group-call-capability-token'),
          type: 'group_capability',
        },
      });
    });

    it('stays active when participants leave, like a community session', () => {
      const call = startGroup();
      call.joinOrAdd(recipient);
      call.joinOrAdd(third);

      call.leave(recipient);
      call.leave(creator);

      expect(call.isActive()).toBe(true);
      expect(call.getJoinedParticipantIds()).toEqual([third]);
    });

    it('lets only its creator end it', () => {
      const call = startGroup();
      call.joinOrAdd(recipient);

      expect(() => call.end(recipient)).toThrow(CallParticipantNotFoundError);
      call.end(creator);
      expect(call.isActive()).toBe(false);
    });

    it('takes its roster from the participation leases', () => {
      const call = startGroup();

      call.restoreLeaseRosteredParticipants([recipient, third]);

      expect(call.getJoinedParticipantIds()).toEqual([recipient, third]);
    });
  });

  it('keeps its own roster for a conversation call', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.restoreLeaseRosteredParticipants([lateParticipant]);

    expect(call.getParticipantIds()).toEqual([creator, recipient]);
  });

  it('clears a previous departure when a community participant rejoins', () => {
    const call = Call.fromPrimitives({
      createdAt: 100,
      creatorIdentityId: creator.valueOf(),
      endedAt: undefined,
      endedByIdentityId: undefined,
      id: '550e8400-e29b-41d4-a716-446655440099',
      networkId: networkId.valueOf(),
      nonce: 'call-nonce-0000000099',
      participantIds: [creator.valueOf()],
      participants: [
        {
          identityId: creator.valueOf(),
          joinedAt: 100,
          leftAt: 200,
          status: 'left',
        },
      ],
      scope: {
        capabilityHash: undefined,
        channelId: 'voice-channel',
        communityId: 'community',
        conversationId: undefined,
        type: 'community_channel',
      },
      status: 'active',
    });

    call.joinOrAdd(creator);

    expect(call.toPrimitives().participants[0]).toMatchObject({
      identityId: creator.valueOf(),
      status: 'joined',
    });
    expect(call.toPrimitives().participants[0]).not.toHaveProperty('leftAt');
  });

  it('should mark ringing participants as missed', () => {
    const call = Call.start(
      creator,
      networkId,
      scope,
      [recipient],
      ...callStartArgs(),
    );

    call.pullDomainEvents();
    const missedParticipants = call.markTimedOut(new Timestamp(1770000000000));
    const events = call.pullDomainEvents();

    expect(missedParticipants).toEqual([recipient]);
    expect(call.toPrimitives()).toMatchObject({
      participants: [
        { identityId: creator.valueOf(), status: 'joined' },
        {
          identityId: recipient.valueOf(),
          missedAt: 1770000000000,
          status: 'missed',
        },
      ],
      status: 'missed',
    });
    expect(events[0]).toBeInstanceOf(CallParticipantMissedEvent);
    expect(events[1]).toBeInstanceOf(CallMissedEvent);
  });
});
