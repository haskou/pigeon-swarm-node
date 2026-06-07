import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PrivateKey } from '@haskou/value-objects';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { PrivateNetworkRelayRecordEnvelope } from './PrivateNetworkRelayRecordEnvelope';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export class PrivateNetworkRelayRecordAuthenticator {
  private static readonly lookupContext =
    'pigeon-swarm.private-relay-record.lookup.v1';

  private static readonly signatureContext =
    'pigeon-swarm.private-relay-record.signature.v1';

  private static readonly recordPrefix = 'pigeon-swarm/private-relays/v1';

  private canonicalRelayRecord(record: PublicRelayRecordPrimitives): string {
    return JSON.stringify({
      expiresAt: record.expiresAt,
      issuedAt: record.issuedAt,
      multiaddrs: [...record.multiaddrs].sort(),
      peerId: record.peerId,
      publicKey: record.publicKey,
      role: record.role,
      signature: record.signature,
      version: record.version,
    });
  }

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

  public lookupKey(network: IPFSNetwork): string {
    const networkKey = this.requireNetworkKey(network);
    const digest = this.hmac(
      networkKey,
      PrivateNetworkRelayRecordAuthenticator.lookupContext,
      'relay-record',
    );

    return `${PrivateNetworkRelayRecordAuthenticator.recordPrefix}/${digest}`;
  }

  public sign(
    network: IPFSNetwork,
    relayRecord: PublicRelayRecordPrimitives,
  ): PrivateNetworkRelayRecordEnvelope {
    const networkKey = this.requireNetworkKey(network);
    const canonicalRecord = this.canonicalRelayRecord(relayRecord);

    return {
      relayRecord,
      signature: this.hmac(
        networkKey,
        PrivateNetworkRelayRecordAuthenticator.signatureContext,
        canonicalRecord,
      ),
      version: 1,
    };
  }

  public verify(
    network: IPFSNetwork,
    envelope: PrivateNetworkRelayRecordEnvelope,
  ): boolean {
    const expectedEnvelope = this.sign(network, envelope.relayRecord);
    const expectedSignature = Buffer.from(expectedEnvelope.signature);
    const receivedSignature = Buffer.from(envelope.signature);

    return (
      expectedSignature.byteLength === receivedSignature.byteLength &&
      timingSafeEqual(expectedSignature, receivedSignature)
    );
  }
}
