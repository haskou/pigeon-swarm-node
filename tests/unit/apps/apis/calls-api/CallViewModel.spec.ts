import { CallViewModel } from '@app/apps/apis/calls-api/view-model/CallViewModel';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import { callStartArgs } from '../../../../support/signCall';

describe('CallViewModel', () => {
  const caller = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const callee = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440021');
  const calleeNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440022');
  const callerNodeId = new NodeId('550e8400-e29b-41d4-a716-446655440023');
  const startedAt = 1_770_000_000_000;

  function answeredCall(): Call {
    const call = Call.start(
      caller,
      networkId,
      CallScope.conversation(new ConversationId('one-to-one:view-model')),
      [callee],
      ...callStartArgs(startedAt),
    );

    call.join(callee, new Timestamp(startedAt + 1_000));

    return call;
  }

  function leaseOf(
    call: Call,
    identityId: IdentityId,
    nodeId: NodeId,
  ): CallParticipantLease {
    return CallParticipantLease.connect(
      call.getId(),
      identityId,
      nodeId,
      networkId,
      call.getParticipantIds(),
      [],
      new Timestamp(startedAt + 2_000),
    );
  }

  it('presents a joined participant without a lease as joined but not connected while leases warm up', () => {
    const call = answeredCall();
    const calleeLease = leaseOf(call, callee, calleeNodeId);

    const resource = new CallViewModel(
      call,
      [calleeLease],
      call.getParticipantIds(),
      true,
    ).toResource();

    expect(resource.participants).toEqual(
      expect.arrayContaining([
        { connected: true, identityId: callee.valueOf(), status: 'joined' },
        { connected: false, identityId: caller.valueOf(), status: 'joined' },
      ]),
    );
    expect(resource.participantIds).toEqual(
      expect.arrayContaining([caller.valueOf(), callee.valueOf()]),
    );
  });

  it('omits a joined participant without a lease once leases have warmed up', () => {
    const call = answeredCall();
    const calleeLease = leaseOf(call, callee, calleeNodeId);

    const resource = new CallViewModel(
      call,
      [calleeLease],
      call.getParticipantIds(),
      false,
    ).toResource();

    expect(resource.participants).toEqual([
      { connected: true, identityId: callee.valueOf(), status: 'joined' },
    ]);
  });

  it('omits a joined participant whose disconnection is known while leases warm up', () => {
    const call = answeredCall();
    const calleeLease = leaseOf(call, callee, calleeNodeId);
    const callerLease = leaseOf(call, caller, callerNodeId);

    callerLease.disconnect(new Timestamp(startedAt + 3_000));

    const resource = new CallViewModel(
      call,
      [calleeLease, callerLease],
      call.getParticipantIds(),
      true,
    ).toResource();

    expect(resource.participants).toEqual([
      { connected: true, identityId: callee.valueOf(), status: 'joined' },
    ]);
  });

  it('omits an unauthorized joined participant without a lease while leases warm up', () => {
    const call = answeredCall();
    const calleeLease = leaseOf(call, callee, calleeNodeId);

    const resource = new CallViewModel(
      call,
      [calleeLease],
      [callee],
      true,
    ).toResource();

    expect(resource.participants).toEqual([
      { connected: true, identityId: callee.valueOf(), status: 'joined' },
    ]);
  });
});
