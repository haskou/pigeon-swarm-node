import { NodeNetworkCommunityState } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkCommunityState';
import { NodeNetworkCommunityStateStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkCommunityStateStatus';
import { NodeNetworkStoreSynchronizationStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkStoreSynchronizationStatus';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { NodeNetworkSynchronizationSource } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationSource';
import { NodeNetworkSynchronizationState } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationState';
import { NodeNetworkSynchronizationStatus } from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationStatus';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';

type PeerCommunityState = {
  digest: NodeCommunityStateDigest;
  receivedAt: number;
};

export default class InMemoryNodeNetworkSynchronizationMonitor extends NodeNetworkSynchronizationMonitor {
  /** Caps the announcements kept per network against peer id flooding. */
  private static readonly MAX_PEER_COMMUNITY_STATES = 256;

  /** Announcements arrive every 10 seconds; three missed ones make a peer unknown. */
  public static COMMUNITY_STATE_TTL_MS = 35_000;

  private changedAt = Date.now();

  private communityStateSignature = '';

  private readonly listeners = new Set<
    (status: NodeNetworkSynchronizationStatus) => void
  >();

  private readonly localCommunityStates = new Map<
    string,
    NodeCommunityStateDigest
  >();

  private readonly networks = new Map<
    string,
    NodeNetworkSynchronizationSource
  >();

  private readonly peerCommunityStates = new Map<
    string,
    Map<string, PeerCommunityState>
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

  private peerCommunityState(
    networkId: string,
    peerId: string,
    now: number,
  ): NodeNetworkCommunityState {
    const localDigest = this.localCommunityStates.get(networkId);
    const announced = this.peerCommunityStates.get(networkId)?.get(peerId);

    if (
      !localDigest ||
      !announced ||
      now - announced.receivedAt >
        InMemoryNodeNetworkSynchronizationMonitor.COMMUNITY_STATE_TTL_MS
    ) {
      return 'unknown';
    }

    return announced.digest.isEqual(localDigest) ? 'converged' : 'diverged';
  }

  private communityStateStatus(
    networkId: string,
    expectedPeerIds: string[],
  ): NodeNetworkCommunityStateStatus {
    const now = Date.now();
    const peers = expectedPeerIds.map((peerId) => ({
      peerId,
      state: this.peerCommunityState(networkId, peerId, now),
    }));
    const states = new Set(peers.map(({ state }) => state));
    const state: NodeNetworkCommunityState =
      peers.length === 0 || !this.localCommunityStates.has(networkId)
        ? 'unknown'
        : states.has('diverged')
          ? 'diverged'
          : states.has('unknown')
            ? 'unknown'
            : 'converged';

    return { peers, state };
  }

  /** Serialises only the community state comparisons, to detect their changes. */
  private communityStateSignatureOf(
    status: NodeNetworkSynchronizationStatus,
  ): string {
    return JSON.stringify(
      status
        .toPrimitives()
        .networks.map(({ communityState, id }) => [id, communityState]),
    );
  }

  private notifyChanged(): void {
    this.changedAt = Date.now();
    const status = this.read();

    this.communityStateSignature = this.communityStateSignatureOf(status);

    for (const listener of this.listeners) {
      listener(status);
    }
  }

  private notifyIfCommunityStateChanged(): void {
    if (
      this.communityStateSignatureOf(this.read()) !==
      this.communityStateSignature
    ) {
      this.notifyChanged();
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
    this.localCommunityStates.delete(networkId);
    this.peerCommunityStates.delete(networkId);

    if (!this.networks.delete(networkId)) {
      return;
    }

    this.notifyChanged();
  }

  public observedNetworks(): Array<{ id: string; localPeerId: string }> {
    return [...this.networks.values()].map(({ id, localPeerId }) => ({
      id,
      localPeerId,
    }));
  }

  public recordLocalCommunityState(
    networkId: string,
    digest: NodeCommunityStateDigest,
  ): void {
    if (!this.networks.has(networkId)) {
      return;
    }

    this.localCommunityStates.set(networkId, digest);
    this.notifyIfCommunityStateChanged();
  }

  public recordPeerCommunityState(
    networkId: string,
    peerId: string,
    digest: NodeCommunityStateDigest,
  ): void {
    const source = this.networks.get(networkId);

    if (!source || source.localPeerId === peerId) {
      return;
    }

    const peers =
      this.peerCommunityStates.get(networkId) ??
      new Map<string, PeerCommunityState>();

    peers.delete(peerId);
    peers.set(peerId, { digest, receivedAt: Date.now() });

    if (
      peers.size >
      InMemoryNodeNetworkSynchronizationMonitor.MAX_PEER_COMMUNITY_STATES
    ) {
      const [oldestPeerId] = peers.keys();

      peers.delete(oldestPeerId);
    }

    this.peerCommunityStates.set(networkId, peers);
    this.notifyIfCommunityStateChanged();
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
          const communityState = this.communityStateStatus(
            source.id,
            expectedPeerIds,
          );
          const state: NodeNetworkSynchronizationState =
            expectedPeerIds.length === 0
              ? 'waiting_for_peers'
              : convergedStoreCount === storeStatuses.length &&
                  communityState.state === 'converged'
                ? 'converged'
                : 'syncing';

          return {
            communityState,
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
