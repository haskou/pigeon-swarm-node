import Kernel from '@app/Kernel';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { PubSubEvent } from '@app/shared/infrastructure/pubsub/libp2p/PubSubEvent';

import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from './PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from './PublicRelayRecordSigner';

export class PublicRelayRecordDiscovery {
  private static readonly topic = 'pigeon-swarm.public-relays.v1';

  private readonly dialedRelays = new Set<string>();

  private multiaddrModulePromise?: Promise<
    typeof import('@multiformats/multiaddr')
  >;

  private started = false;

  public constructor(
    private readonly registry = new PublicRelayRecordRegistry(),
    private readonly signer = new PublicRelayRecordSigner(),
  ) {}

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

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private hasRelayRecordStrings(record: Record<string, unknown>): boolean {
    return (
      typeof record.peerId === 'string' &&
      typeof record.publicKey === 'string' &&
      typeof record.signature === 'string'
    );
  }

  private hasRelayRecordTimestamps(record: Record<string, unknown>): boolean {
    return (
      typeof record.issuedAt === 'number' &&
      typeof record.expiresAt === 'number'
    );
  }

  private hasRelayRecordMultiaddrs(record: Record<string, unknown>): boolean {
    return (
      Array.isArray(record.multiaddrs) &&
      record.multiaddrs.every((address) => typeof address === 'string')
    );
  }

  private isRecord(value: unknown): value is PublicRelayRecordPrimitives {
    if (!this.isPlainRecord(value)) {
      return false;
    }

    return (
      value.version === 1 &&
      value.role === 'relay' &&
      this.hasRelayRecordStrings(value) &&
      this.hasRelayRecordTimestamps(value) &&
      this.hasRelayRecordMultiaddrs(value)
    );
  }

  private recordContainsPeerAddress(
    record: PublicRelayRecordPrimitives,
  ): boolean {
    return record.multiaddrs.every((address) =>
      address.includes(`/p2p/${record.peerId}`),
    );
  }

  private async dialRecord(
    node: Libp2pPubSubNode,
    record: PublicRelayRecordPrimitives,
  ): Promise<void> {
    if (!node.dial || this.dialedRelays.has(record.peerId)) {
      return;
    }

    for (const address of record.multiaddrs) {
      try {
        const { multiaddr } = await this.loadMultiaddrModule();

        await node.dial(multiaddr(address));
        this.dialedRelays.add(record.peerId);

        return;
      } catch (error: unknown) {
        Kernel.logger.debug(
          `Public relay record dial failed peerId="${record.peerId}" address="${address}" error="${String(
            error,
          )}"`,
        );
      }
    }
  }

  private async handleRecord(
    node: Libp2pPubSubNode,
    record: PublicRelayRecordPrimitives,
  ): Promise<void> {
    if (
      !this.recordContainsPeerAddress(record) ||
      !(await this.signer.verify(record, record.signature))
    ) {
      return;
    }

    this.registry.save(record);
    await this.dialRecord(node, record);
  }

  private async handleEvent(
    node: Libp2pPubSubNode,
    event: PubSubEvent,
  ): Promise<void> {
    const message = this.getPubSubMessage(event);

    if (message.topic !== PublicRelayRecordDiscovery.topic || !message.data) {
      return;
    }

    const payload = JSON.parse(new TextDecoder().decode(message.data));

    if (!this.isRecord(payload)) {
      return;
    }

    await this.handleRecord(node, payload);
  }

  public async start(node: Libp2pPubSubNode): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await node.services.pubsub.subscribe(PublicRelayRecordDiscovery.topic);
    const listener = (event: PubSubEvent): void => {
      this.handleEvent(node, event).catch((error: unknown) => {
        Kernel.logger.debug(
          `Public relay record discovery failed: ${String(error)}`,
        );
      });
    };

    node.services.pubsub.addEventListener('message', listener);
    node.services.pubsub.addEventListener('gossipsub:message', listener);
  }

  public async publish(
    node: Libp2pPubSubNode,
    record: PublicRelayRecordPrimitives,
  ): Promise<void> {
    this.registry.save(record);
    await node.services.pubsub.publish(
      PublicRelayRecordDiscovery.topic,
      new TextEncoder().encode(JSON.stringify(record)),
    );
  }
}
