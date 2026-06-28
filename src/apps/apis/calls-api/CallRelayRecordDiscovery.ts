import { PublicRelayPubSubConnection } from '@app/shared/infrastructure/network/relay/PublicRelayPubSubConnection';
import Kernel from '@haskou/ddd-kernel';

import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';
import CallRelayRecordRegistry from './CallRelayRecordRegistry';
import CallRelayRecordSigner from './CallRelayRecordSigner';

export default class CallRelayRecordDiscovery {
  private static readonly topic = 'pigeon-swarm.call-relays.v1';

  private readonly startedConnections = new WeakSet<object>();

  public constructor(
    private readonly registry: CallRelayRecordRegistry,
    private readonly signer: CallRelayRecordSigner,
  ) {}

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private hasRecordStrings(record: Record<string, unknown>): boolean {
    return (
      typeof record.peerId === 'string' &&
      typeof record.publicKey === 'string' &&
      typeof record.signature === 'string'
    );
  }

  private hasRecordTimestamps(record: Record<string, unknown>): boolean {
    return (
      typeof record.issuedAt === 'number' &&
      typeof record.expiresAt === 'number'
    );
  }

  private hasTurnUrls(record: Record<string, unknown>): boolean {
    return (
      Array.isArray(record.urls) &&
      record.urls.length > 0 &&
      record.urls.every(
        (url) =>
          typeof url === 'string' &&
          (url.startsWith('turn:') || url.startsWith('turns:')),
      )
    );
  }

  private isRecord(value: unknown): value is CallRelayRecordPrimitives {
    if (!this.isPlainRecord(value)) {
      return false;
    }

    return (
      value.version === 1 &&
      value.role === 'call-relay' &&
      this.hasRecordStrings(value) &&
      this.hasRecordTimestamps(value) &&
      this.hasTurnUrls(value)
    );
  }

  private async saveValidRecord(
    record: CallRelayRecordPrimitives,
  ): Promise<void> {
    if (!(await this.signer.verify(record, record.signature))) {
      return;
    }

    this.registry.save(record);
  }

  private async handlePayload(payload: string): Promise<void> {
    const parsedPayload = JSON.parse(payload);

    if (!this.isRecord(parsedPayload)) {
      return;
    }

    await this.saveValidRecord(parsedPayload);
  }

  public async startConnection(
    connection: PublicRelayPubSubConnection,
  ): Promise<void> {
    const connectionKey = connection as unknown as object;

    if (this.startedConnections.has(connectionKey)) {
      return;
    }

    this.startedConnections.add(connectionKey);
    await connection.subscribePubSub(
      CallRelayRecordDiscovery.topic,
      async (payload) => {
        await this.handlePayload(payload).catch((error: unknown) => {
          Kernel.logger.debug(
            `Call relay record discovery failed: ${String(error)}`,
          );
        });
      },
    );
  }

  public async publishConnection(
    connection: PublicRelayPubSubConnection,
    record: CallRelayRecordPrimitives,
  ): Promise<void> {
    this.registry.save(record);
    await connection.publishPubSub(
      CallRelayRecordDiscovery.topic,
      JSON.stringify(record),
    );
  }
}
