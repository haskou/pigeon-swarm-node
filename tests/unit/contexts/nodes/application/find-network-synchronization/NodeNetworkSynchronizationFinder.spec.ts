import NodeNetworkSynchronizationFinder from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationFinder';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodeNetworkSynchronizationStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationStatus';
import { mock } from 'jest-mock-extended';

describe('NodeNetworkSynchronizationFinder', () => {
  it('finds the current live synchronization status', () => {
    const monitor = mock<NodeNetworkSynchronizationMonitor>();
    const status = new NodeNetworkSynchronizationStatus({
      changedAt: 1780000000000,
      networks: [],
    });

    monitor.read.mockReturnValue(status);

    expect(new NodeNetworkSynchronizationFinder(monitor).find()).toBe(status);
  });
});
