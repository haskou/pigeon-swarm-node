import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PrivateKey } from '@haskou/value-objects';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

import { PrivateNetworkRelayRecord } from './PrivateNetworkRelayRecord';
import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';

export default class PrivateNetworkRelayRecordCodec {
  private static readonly encryptionAlgorithm = 'aes-256-gcm';

  private static readonly encryptionContext =
    'pigeon-swarm.private-relay-record.encryption.v1';

  private static readonly lookupContext =
    'pigeon-swarm.private-relay-record.lookup.v1';

  private static readonly recordPrefix = 'pigeon-swarm/private-relays/v1';

  private static requireNetworkKey(network: IPFSNetwork): PrivateKey {
    const key = network.getConfig().getKey();

    if (!key) {
      throw new Error(
        `Network "${network.getId()}" cannot use private relay records without a private network key.`,
      );
    }

    return key;
  }

  private static hmac(
    networkKey: PrivateKey,
    context: string,
    value: string,
  ): string {
    return createHmac('sha256', networkKey.valueOf())
      .update(context)
      .update('\n')
      .update(value)
      .digest('base64url');
  }

  private static encryptionKey(networkKey: PrivateKey): Buffer {
    return createHmac('sha256', networkKey.valueOf())
      .update(PrivateNetworkRelayRecordCodec.encryptionContext)
      .digest();
  }

  private static isPlainObject(
    value: unknown,
  ): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private static hasPrivateRelayRecordStrings(
    value: Partial<PrivateNetworkRelayRecord>,
  ): boolean {
    return typeof value.peerId === 'string';
  }

  private static hasPrivateRelayRecordTimestamps(
    value: Partial<PrivateNetworkRelayRecord>,
  ): boolean {
    return (
      typeof value.issuedAt === 'number' && typeof value.expiresAt === 'number'
    );
  }

  private static hasPrivateRelayRecordMultiaddrs(
    value: Partial<PrivateNetworkRelayRecord>,
  ): boolean {
    return (
      Array.isArray(value.multiaddrs) &&
      value.multiaddrs.every((multiaddr) => typeof multiaddr === 'string')
    );
  }

  private static isPrivateRelayRecord(
    value: unknown,
  ): value is PrivateNetworkRelayRecord {
    if (!PrivateNetworkRelayRecordCodec.isPlainObject(value)) {
      return false;
    }

    const candidate = value as Partial<PrivateNetworkRelayRecord>;

    return (
      candidate.version === 1 &&
      candidate.role === 'relay' &&
      PrivateNetworkRelayRecordCodec.hasPrivateRelayRecordStrings(candidate) &&
      PrivateNetworkRelayRecordCodec.hasPrivateRelayRecordTimestamps(
        candidate,
      ) &&
      PrivateNetworkRelayRecordCodec.hasPrivateRelayRecordMultiaddrs(candidate)
    );
  }

  public static fingerprint(network: IPFSNetwork): string {
    const networkKey =
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network);

    return createHash('sha256')
      .update(networkKey.valueOf())
      .digest('base64url')
      .slice(0, 16);
  }

  public static lookupKey(network: IPFSNetwork): string {
    const networkKey =
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network);
    const digest = PrivateNetworkRelayRecordCodec.hmac(
      networkKey,
      PrivateNetworkRelayRecordCodec.lookupContext,
      'relay-record',
    );

    return `${PrivateNetworkRelayRecordCodec.recordPrefix}/${digest}`;
  }

  public static seal(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): PrivateNetworkRelayRecordEnvelope {
    const networkKey =
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network);
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      PrivateNetworkRelayRecordCodec.encryptionAlgorithm,
      PrivateNetworkRelayRecordCodec.encryptionKey(networkKey),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(relayRecord), 'utf8'),
      cipher.final(),
    ]);

    return {
      encryptedRelayRecord: {
        algorithm: PrivateNetworkRelayRecordCodec.encryptionAlgorithm,
        authTag: cipher.getAuthTag().toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        iv: iv.toString('base64url'),
      },
      version: 1,
    };
  }

  public static open(
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): PrivateNetworkRelayRecord | undefined {
    const networkKey =
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network);
    const encryptedRecord = envelope.encryptedRelayRecord;

    if (
      envelope.version !== 1 ||
      encryptedRecord.algorithm !==
        PrivateNetworkRelayRecordCodec.encryptionAlgorithm
    ) {
      return undefined;
    }

    try {
      const decipher = createDecipheriv(
        encryptedRecord.algorithm,
        PrivateNetworkRelayRecordCodec.encryptionKey(networkKey),
        Buffer.from(encryptedRecord.iv, 'base64url'),
      );

      decipher.setAuthTag(Buffer.from(encryptedRecord.authTag, 'base64url'));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encryptedRecord.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const relayRecord: unknown = JSON.parse(plaintext);

      if (!PrivateNetworkRelayRecordCodec.isPrivateRelayRecord(relayRecord)) {
        return undefined;
      }

      return relayRecord;
    } catch {
      return undefined;
    }
  }
}
