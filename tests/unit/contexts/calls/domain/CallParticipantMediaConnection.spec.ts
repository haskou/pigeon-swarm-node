import { CallParticipantMediaConnection } from '@app/contexts/calls/domain/CallParticipantMediaConnection';

describe(CallParticipantMediaConnection.name, () => {
  const primitives = {
    remoteIdentityId:
      'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
    state: 'connected',
  };

  it('keeps omitted media fields compatible with stored reports', () => {
    const connection =
      CallParticipantMediaConnection.fromPrimitives(primitives);
    expect(JSON.parse(JSON.stringify(connection.toPrimitives()))).toEqual(
      primitives,
    );
    expect(connection.usesRelay()).toBe(false);
    expect(
      connection.isEqual(
        CallParticipantMediaConnection.fromPrimitives(primitives),
      ),
    ).toBe(true);
  });

  it('detects route changes after hydrating equivalent reports', () => {
    const connection =
      CallParticipantMediaConnection.fromPrimitives(primitives);
    const relay = CallParticipantMediaConnection.fromPrimitives({
      ...primitives,
      localCandidateType: 'relay',
      relayUrl: 'turn:relay.example:3478?transport=udp',
    });
    expect(connection.isEqual(relay)).toBe(false);
    expect(relay.usesRelay()).toBe(true);
  });
});
