import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'crypto';

interface ClearEnvelope {
  encrypted: false;
  payload: string;
}

interface EncryptedEnvelope {
  algorithm: 'aes-256-gcm';
  encrypted: true;
  iv: string;
  payload: string;
  tag: string;
}

type PubSubNetworkEnvelope = ClearEnvelope | EncryptedEnvelope;

export default class PubSubNetworkMessageCodec {
  private static readonly algorithm = 'aes-256-gcm';

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
    const envelope = JSON.parse(payload) as PubSubNetworkEnvelope;

    if (!envelope.encrypted) {
      return envelope.payload;
    }

    return this.decrypt(envelope, network);
  }
}
