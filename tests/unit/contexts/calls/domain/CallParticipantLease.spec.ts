import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallParticipantMediaConnection } from '@app/contexts/calls/domain/CallParticipantMediaConnection';
import { InvalidCallParticipantMediaConnectionError } from '@app/contexts/calls/domain/errors/InvalidCallParticipantMediaConnectionError';
import { CallParticipantLeaseWasUpdatedEvent } from '@app/contexts/calls/domain/events/CallParticipantLeaseWasUpdatedEvent';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallIceCandidateType } from '@app/contexts/calls/domain/value-objects/CallIceCandidateType';
import { CallMediaConnectionState } from '@app/contexts/calls/domain/value-objects/CallMediaConnectionState';
import { CallRelayUrl } from '@app/contexts/calls/domain/value-objects/CallRelayUrl';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

describe('CallParticipantLease', () => {
  const callId = new CallId('550e8400-e29b-41d4-a716-446655440010');
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const remoteIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440011');
  const nodeId = new NodeId('550e8400-e29b-41d4-a716-446655440012');

  it('publishes every renewal even while connection status is unchanged', () => {
    const lease = CallParticipantLease.connect(
      callId,
      identityId,
      nodeId,
      networkId,
      [identityId],
      [],
      new Timestamp(100),
    );

    lease.pullDomainEvents();
    lease.renew([], new Timestamp(200));

    expect(lease.isConnected()).toBe(true);
    expect(lease.getLastHeartbeatAt().isEqual(new Timestamp(200))).toBe(true);
    expect(lease.pullDomainEvents()[0]).toBeInstanceOf(
      CallParticipantLeaseWasUpdatedEvent,
    );
  });

  it('disconnects a timed out lease once', () => {
    const lease = CallParticipantLease.connect(
      callId,
      identityId,
      nodeId,
      networkId,
      [identityId],
      [],
      new Timestamp(100),
    );

    expect(lease.hasTimedOut(new Timestamp(100))).toBe(true);
    expect(lease.disconnect(new Timestamp(200))).toBe(true);
    expect(lease.disconnect(new Timestamp(300))).toBe(false);
  });

  it('replicates selected relay changes without durable call writes', () => {
    const mediaConnection = CallParticipantMediaConnection.fromPrimitives({
      localCandidateType: 'relay',
      relayUrl: 'turn:relay.example:3478?transport=udp',
      remoteCandidateType: 'relay',
      remoteIdentityId: remoteIdentityId.valueOf(),
      state: 'connected',
    });
    const lease = CallParticipantLease.connect(
      callId,
      identityId,
      nodeId,
      networkId,
      [identityId, remoteIdentityId],
      [mediaConnection],
      new Timestamp(100),
    );

    lease.pullDomainEvents();
    lease.renew([mediaConnection], new Timestamp(200));

    expect(lease.pullDomainEvents()[0].attributes).toMatchObject({
      connectionChanged: false,
      mediaConnectionsChanged: false,
    });
    expect(lease.getMediaConnections()[0].usesRelay()).toBe(true);
  });

  it('rejects media reports targeting self or duplicate participants', () => {
    const selfConnection = new CallParticipantMediaConnection(
      identityId,
      CallMediaConnectionState.fromPrimitives('connected'),
      CallIceCandidateType.fromPrimitives('relay'),
      CallIceCandidateType.fromPrimitives('relay'),
      new CallRelayUrl('turn:relay.example:3478?transport=udp'),
    );
    const remoteConnection = CallParticipantMediaConnection.fromPrimitives({
      remoteIdentityId: remoteIdentityId.valueOf(),
      state: 'connected',
    });

    expect(() =>
      CallParticipantLease.connect(
        callId,
        identityId,
        nodeId,
        networkId,
        [identityId, remoteIdentityId],
        [selfConnection],
      ),
    ).toThrow(InvalidCallParticipantMediaConnectionError);
    expect(() =>
      CallParticipantLease.connect(
        callId,
        identityId,
        nodeId,
        networkId,
        [identityId, remoteIdentityId],
        [remoteConnection, remoteConnection],
      ),
    ).toThrow(InvalidCallParticipantMediaConnectionError);
  });
});
