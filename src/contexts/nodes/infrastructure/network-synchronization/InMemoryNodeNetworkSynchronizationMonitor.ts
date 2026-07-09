import { NodeNetworkStoreSynchronizationStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkStoreSynchronizationStatus';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodeNetworkSynchronizationSource } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationSource';
import { NodeNetworkSynchronizationState } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationState';
import { NodeNetworkSynchronizationStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationStatus';

export default class InMemoryNodeNetworkSynchronizationMonitor extends NodeNetworkSynchronizationMonitor {
  private changedAt = Date.now();

  private readonly listeners = new Set<
    (status: NodeNetworkSynchronizationStatus) => void
  >();

  private readonly networks = new Map<
    string,
    NodeNetworkSynchronizationSource
  >();

  private replicationPeerIds(
    source: NodeNetworkSynchronizationSource,
  ): string[] {
    const peerIds = new Set<string>();

    for (const store of source.stores) {
      for (const peerId of store.getPeerIds()) {
        peerIds.add(peerId);
      }
    }

    return [...peerIds].sort();
  }

  private storeState(
    peerIds: string[],
    expectedPeerIds: string[],
  ): NodeNetworkSynchronizationState {
    if (expectedPeerIds.length === 0) {
      return 'waiting_for_peers';
    }

    return expectedPeerIds.every((peerId) => peerIds.includes(peerId))
      ? 'converged'
      : 'syncing';
  }

  private expectedPeerIds(
    source: NodeNetworkSynchronizationSource,
    replicationPeerIds: string[],
  ): string[] {
    if (!source.isPrivate) {
      return replicationPeerIds;
    }

    return [
      ...new Set([...source.getConnectedPeerIds(), ...replicationPeerIds]),
    ].sort();
  }

  private storesStatus(
    source: NodeNetworkSynchronizationSource,
    expectedPeerIds: string[],
  ): NodeNetworkStoreSynchronizationStatus[] {
    return source.stores.map((store) => {
      const peerIds = [...store.getPeerIds()].sort();

      return {
        name: store.name,
        peerIds,
        state: this.storeState(peerIds, expectedPeerIds),
      };
    });
  }

  private notifyChanged(): void {
    this.changedAt = Date.now();
    const status = this.read();

    for (const listener of this.listeners) {
      listener(status);
    }
  }

  public observe(source: NodeNetworkSynchronizationSource): void {
    if (this.networks.has(source.id)) {
      return;
    }

    this.networks.set(source.id, source);
    source.onPeerConnected(() => this.notifyChanged());
    source.onPeerDisconnected(() => this.notifyChanged());

    for (const store of source.stores) {
      store.onPeerJoined(() => this.notifyChanged());
      store.onPeerLeft(() => this.notifyChanged());
    }

    this.notifyChanged();
  }

  public remove(networkId: string): void {
    if (!this.networks.delete(networkId)) {
      return;
    }

    this.notifyChanged();
  }

  public read(): NodeNetworkSynchronizationStatus {
    return new NodeNetworkSynchronizationStatus({
      changedAt: this.changedAt,
      networks: [...this.networks.values()]
        .map((source) => {
          const connectedPeerIds = [...source.getConnectedPeerIds()].sort();
          const replicationPeerIds = this.replicationPeerIds(source);
          const expectedPeerIds = this.expectedPeerIds(
            source,
            replicationPeerIds,
          );
          const storeStatuses = this.storesStatus(source, expectedPeerIds);
          const convergedStoreCount = storeStatuses.filter(
            ({ state }) => state === 'converged',
          ).length;
          const state: NodeNetworkSynchronizationState =
            expectedPeerIds.length === 0
              ? 'waiting_for_peers'
              : convergedStoreCount === storeStatuses.length
                ? 'converged'
                : 'syncing';

          return {
            connectedPeerIds,
            convergedStoreCount,
            id: source.id,
            name: source.name,
            replicationPeerIds,
            state,
            stores: storeStatuses,
            totalStoreCount: storeStatuses.length,
            type: source.type,
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
  }

  public onChanged(
    listener: (status: NodeNetworkSynchronizationStatus) => void,
  ): void {
    this.listeners.add(listener);
  }
}
