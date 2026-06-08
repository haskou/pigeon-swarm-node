import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PrivateKey } from '@haskou/value-objects';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export class PrivateNetworkRelayRecordAuthenticator {
  private static readonly encryptionAlgorithm = 'aes-256-gcm';

  private static readonly encryptionContext =
    'pigeon-swarm.private-relay-record.encryption.v1';

  private static readonly ipnsContext =
    'pigeon-swarm.private-relay-record.ipns.v1';

  private static readonly lookupContext =
    'pigeon-swarm.private-relay-record.lookup.v1';

  private static readonly recordPrefix = 'pigeon-swarm/private-relays/v1';

  private getNetworkKey(network: IPFSNetwork): PrivateKey | undefined {
    return network.getConfig().getKey();
  }

  private requireNetworkKey(network: IPFSNetwork): PrivateKey {
    const key = this.getNetworkKey(network);

    if (!key) {
      throw new Error(
        `Network "${network.getId()}" cannot publish private relay records without a private network key.`,
      );
    }

    return key;
  }

  private hmac(networkKey: PrivateKey, context: string, value: string): string {
    return createHmac('sha256', networkKey.valueOf())
      .update(context)
      .update('\n')
      .update(value)
      .digest('base64url');
  }

  private encryptionKey(networkKey: PrivateKey): Buffer {
    return createHmac('sha256', networkKey.valueOf())
      .update(PrivateNetworkRelayRecordAuthenticator.encryptionContext)
      .digest();
  }

  private hasRelayRecordNumbers(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      typeof value.expiresAt === 'number' && typeof value.issuedAt === 'number'
    );
  }

  private hasRelayRecordStrings(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      typeof value.peerId === 'string' &&
      typeof value.publicKey === 'string' &&
      typeof value.signature === 'string'
    );
  }

  private hasRelayRecordMultiaddrs(
    value: Partial<PublicRelayRecordPrimitives>,
  ): boolean {
    return (
      Array.isArray(value.multiaddrs) &&
      value.multiaddrs.every((address) => typeof address === 'string')
    );
  }

  private isRelayRecord(value: unknown): value is PublicRelayRecordPrimitives {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<PublicRelayRecordPrimitives>;

    return (
      candidate.version === 1 &&
      candidate.role === 'relay' &&
      this.hasRelayRecordNumbers(candidate) &&
      this.hasRelayRecordMultiaddrs(candidate) &&
      this.hasRelayRecordStrings(candidate)
    );
  }

  public lookupKey(network: IPFSNetwork): string {
    const networkKey = this.requireNetworkKey(network);
    const digest = this.hmac(
      networkKey,
      PrivateNetworkRelayRecordAuthenticator.lookupContext,
      'relay-record',
    );

    return `${PrivateNetworkRelayRecordAuthenticator.recordPrefix}/${digest}`;
  }

  public ipnsSeed(network: IPFSNetwork, windowId: number): Uint8Array {
    const networkKey = this.requireNetworkKey(network);

    return createHmac('sha256', networkKey.valueOf())
      .update(PrivateNetworkRelayRecordAuthenticator.ipnsContext)
      .update('\n')
      .update(String(windowId))
      .digest();
  }

  public fingerprint(network: IPFSNetwork): string {
    const networkKey = this.requireNetworkKey(network);

    return createHash('sha256')
      .update(networkKey.valueOf())
      .digest('base64url')
      .slice(0, 16);
  }

  public seal(
    network: IPFSNetwork,
    relayRecord: PublicRelayRecordPrimitives,
  ): PrivateNetworkRelayRecordEnvelope {
    const networkKey = this.requireNetworkKey(network);
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      PrivateNetworkRelayRecordAuthenticator.encryptionAlgorithm,
      this.encryptionKey(networkKey),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(relayRecord), 'utf8'),
      cipher.final(),
    ]);

    return {
      encryptedRelayRecord: {
        algorithm: PrivateNetworkRelayRecordAuthenticator.encryptionAlgorithm,
        authTag: cipher.getAuthTag().toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        iv: iv.toString('base64url'),
      },
      version: 2,
    };
  }

  public open(
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): PublicRelayRecordPrimitives | undefined {
    const networkKey = this.requireNetworkKey(network);
    const encryptedRecord = envelope.encryptedRelayRecord;

    if (
      envelope.version !== 2 ||
      encryptedRecord.algorithm !==
        PrivateNetworkRelayRecordAuthenticator.encryptionAlgorithm
    ) {
      return undefined;
    }

    try {
      const decipher = createDecipheriv(
        encryptedRecord.algorithm,
        this.encryptionKey(networkKey),
        Buffer.from(encryptedRecord.iv, 'base64url'),
      );

      decipher.setAuthTag(Buffer.from(encryptedRecord.authTag, 'base64url'));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encryptedRecord.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const relayRecord: unknown = JSON.parse(plaintext);

      if (!this.isRelayRecord(relayRecord)) {
        return undefined;
      }

      return relayRecord;
    } catch {
      return undefined;
    }
  }
}
