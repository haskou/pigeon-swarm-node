import Kernel from '@haskou/ddd-kernel';

import { Libp2pPubSubNode } from './Libp2pPubSubNode';
import { PublicRelayPeerAnnouncement } from './PublicRelayPeerAnnouncement';
import { PubSubEvent } from './PubSubEvent';

export class PublicRelayPeerAnnouncer {
  private static readonly topic = 'pigeon-swarm.public-relay.peers.v1';
  private static readonly intervalMs = 5000;

  private readonly dialedPeers = new Set<string>();
  private multiaddrModulePromise?: Promise<
    typeof import('@multiformats/multiaddr')
  >;

  private interval?: NodeJS.Timeout;

  private started = false;

  public constructor(private readonly forwardOnly = false) {}

  private debug(message: string): void {
    Kernel.logger?.debug?.(message);
  }

  private nativeImport<TModule>(modulePath: string): Promise<TModule> {
    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadMultiaddrModule(): Promise<
    typeof import('@multiformats/multiaddr')
  > {
    this.multiaddrModulePromise ??= this.nativeImport<
      typeof import('@multiformats/multiaddr')
    >('@multiformats/multiaddr');

    return this.multiaddrModulePromise;
  }

  private getPubSubMessage(event: PubSubEvent): {
    data?: Uint8Array;
    topic?: string;
  } {
    return event.detail.msg || event.detail;
  }

  private buildAnnouncement(
    node: Libp2pPubSubNode,
  ): PublicRelayPeerAnnouncement | undefined {
    const peerId = node.peerId?.toString();

    if (!peerId) {
      return undefined;
    }

    return {
      issuedAt: Date.now(),
      multiaddrs: (node.getMultiaddrs?.() || []).map((address) =>
        String(address),
      ),
      peerId,
      version: 1,
    };
  }

  private async publish(node: Libp2pPubSubNode): Promise<void> {
    const announcement = this.buildAnnouncement(node);

    if (!announcement || announcement.multiaddrs.length === 0) {
      return;
    }

    await node.services.pubsub.publish(
      PublicRelayPeerAnnouncer.topic,
      new TextEncoder().encode(JSON.stringify(announcement)),
    );
  }

  private async dialPeer(
    node: Libp2pPubSubNode,
    announcement: PublicRelayPeerAnnouncement,
  ): Promise<void> {
    if (
      this.forwardOnly ||
      !node.dial ||
      node.peerId?.toString() === announcement.peerId ||
      this.dialedPeers.has(announcement.peerId)
    ) {
      return;
    }

    for (const address of announcement.multiaddrs) {
      try {
        const { multiaddr } = await this.loadMultiaddrModule();

        await node.dial(multiaddr(address));
        this.dialedPeers.add(announcement.peerId);

        return;
      } catch (error: unknown) {
        this.debug(
          `Public relay peer dial failed peerId="${announcement.peerId}" address="${address}" error="${String(
            error,
          )}"`,
        );
      }
    }
  }

  private async handleEvent(
    node: Libp2pPubSubNode,
    event: PubSubEvent,
  ): Promise<void> {
    const message = this.getPubSubMessage(event);

    if (message.topic !== PublicRelayPeerAnnouncer.topic || !message.data) {
      return;
    }

    const announcement = JSON.parse(
      new TextDecoder().decode(message.data),
    ) as PublicRelayPeerAnnouncement;

    if (
      announcement.version !== 1 ||
      !announcement.peerId ||
      !Array.isArray(announcement.multiaddrs)
    ) {
      return;
    }

    await this.dialPeer(node, announcement);
  }

  public async start(node: Libp2pPubSubNode): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await node.services.pubsub.subscribe(PublicRelayPeerAnnouncer.topic);
    const listener = (event: PubSubEvent): void => {
      this.handleEvent(node, event).catch((error: unknown) => {
        this.debug(`Public relay peer announcement failed: ${String(error)}`);
      });
    };

    node.services.pubsub.addEventListener('message', listener);
    node.services.pubsub.addEventListener('gossipsub:message', listener);

    if (this.forwardOnly) {
      return;
    }

    await this.publish(node);
    this.interval = setInterval(() => {
      this.publish(node).catch((error: unknown) => {
        this.debug(
          `Public relay peer announcement publish failed: ${String(error)}`,
        );
      });
    }, PublicRelayPeerAnnouncer.intervalMs);
    this.interval.unref?.();
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.started = false;
  }
}
