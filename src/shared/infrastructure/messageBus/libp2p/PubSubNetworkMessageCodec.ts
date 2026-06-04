import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'crypto';

import { ClearEnvelope } from './ClearEnvelope';
import { EncryptedEnvelope } from './EncryptedEnvelope';
import { PubSubNetworkEnvelope } from './PubSubNetworkEnvelope';

export default class PubSubNetworkMessageCodec {
  private static readonly algorithm = 'aes-256-gcm';

  private assertEnvelope(
    value: unknown,
  ): asserts value is PubSubNetworkEnvelope {
    if (!this.isEnvelope(value)) {
      throw new Error('Invalid pubsub network message envelope.');
    }
  }

  private hasStringProperty(
    value: Record<string, unknown>,
    property: string,
  ): boolean {
    return typeof value[property] === 'string';
  }

  private isClearEnvelope(value: Record<string, unknown>): boolean {
    return (
      value.encrypted === false && this.hasStringProperty(value, 'payload')
    );
  }

  private isEncryptedEnvelope(value: Record<string, unknown>): boolean {
    return (
      value.algorithm === PubSubNetworkMessageCodec.algorithm &&
      value.encrypted === true &&
      this.hasStringProperty(value, 'iv') &&
      this.hasStringProperty(value, 'payload') &&
      this.hasStringProperty(value, 'tag')
    );
  }

  private isEnvelope(value: unknown): value is PubSubNetworkEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const envelope = value as Record<string, unknown>;

    return this.isClearEnvelope(envelope) || this.isEncryptedEnvelope(envelope);
  }

  private encryptionKey(network: IPFSNetwork): Buffer {
    const key = network.getConfig().getKey();

    if (!key) {
      throw new Error('Cannot encrypt a pubsub message without a network key.');
    }

    return createHash('sha256').update(key.valueOf()).digest();
  }

  private encrypt(payload: string, network: IPFSNetwork): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      PubSubNetworkMessageCodec.algorithm,
      this.encryptionKey(network),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(payload, 'utf8'),
      cipher.final(),
    ]);

    return JSON.stringify({
      algorithm: PubSubNetworkMessageCodec.algorithm,
      encrypted: true,
      iv: iv.toString('base64'),
      payload: encrypted.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    } satisfies EncryptedEnvelope);
  }

  private decrypt(envelope: EncryptedEnvelope, network: IPFSNetwork): string {
    const decipher = createDecipheriv(
      envelope.algorithm,
      this.encryptionKey(network),
      Buffer.from(envelope.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(envelope.payload, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  public encode(payload: string, network: IPFSNetwork): string {
    if (network.isPrivate()) {
      return this.encrypt(payload, network);
    }

    return JSON.stringify({
      encrypted: false,
      payload,
    } satisfies ClearEnvelope);
  }

  public decode(payload: string, network: IPFSNetwork): string {
    const envelope = JSON.parse(payload) as unknown;

    this.assertEnvelope(envelope);

    if (!envelope.encrypted) {
      return envelope.payload;
    }

    return this.decrypt(envelope, network);
  }
}
