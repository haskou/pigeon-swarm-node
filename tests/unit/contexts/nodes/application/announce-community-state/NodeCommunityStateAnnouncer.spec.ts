import NodeCommunityStateAnnouncer from '@app/contexts/nodes/application/announce-community-state/NodeCommunityStateAnnouncer';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodeCommunityStateWasAnnounced } from '@app/contexts/nodes/domain/events/NodeCommunityStateWasAnnounced';
import NodeCommunityStateDigester from '@app/contexts/nodes/domain/services/NodeCommunityStateDigester';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeCommunityStateAnnouncer', () => {
  const firstDigest = new NodeCommunityStateDigest('A'.repeat(43));
  const secondDigest = new NodeCommunityStateDigest('B'.repeat(43));
  let digester: MockProxy<NodeCommunityStateDigester>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let monitor: MockProxy<NodeNetworkSynchronizationMonitor>;
  let announcer: NodeCommunityStateAnnouncer;

  beforeEach(() => {
    digester = mock<NodeCommunityStateDigester>();
    eventPublisher = mock<DomainEventPublisher>();
    monitor = mock<NodeNetworkSynchronizationMonitor>();
    announcer = new NodeCommunityStateAnnouncer(
      monitor,
      digester,
      eventPublisher,
    );
  });

  it('records and announces the community state digest of every observed network', async () => {
    monitor.observedNetworks.mockReturnValue([
      { id: 'network-1', localPeerId: 'peer-1' },
      { id: 'network-2', localPeerId: 'peer-2' },
    ]);
    digester.digest.mockImplementation(async (networkId) =>
      networkId === 'network-1' ? firstDigest : secondDigest,
    );

    await announcer.announce();

    expect(monitor.recordLocalCommunityState).toHaveBeenCalledWith(
      'network-1',
      firstDigest,
    );
    expect(monitor.recordLocalCommunityState).toHaveBeenCalledWith(
      'network-2',
      secondDigest,
    );

    const events = eventPublisher.publish.mock.calls[0][0];

    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(NodeCommunityStateWasAnnounced);
    expect(events[0].aggregateId).toBe('peer-1');
    expect(events[0].attributes).toEqual({
      digest: firstDigest.valueOf(),
      networkId: 'network-1',
    });
    expect(events[1].aggregateId).toBe('peer-2');
    expect(events[1].attributes).toEqual({
      digest: secondDigest.valueOf(),
      networkId: 'network-2',
    });
  });

  it('publishes nothing while no network is observed', async () => {
    monitor.observedNetworks.mockReturnValue([]);

    await announcer.announce();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
