import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { PrivateNetworkPubSubEnvelope } from '@haskou/pigeon-swarm-crypto';

import { ClearEnvelope } from './ClearEnvelope';

export default class PubSubNetworkMessageCodec {
  private networkKey(network: IPFSNetwork) {
    const key = network.getConfig().getKey();

    if (!key) {
      throw new Error('Private network has no network key.');
    }

    return key;
  }

  private decodeClear(payload: string): string {
    const envelope = JSON.parse(payload) as Partial<ClearEnvelope> | null;

    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(',') !== 'encrypted,payload' ||
      envelope.encrypted !== false ||
      typeof envelope.payload !== 'string'
    ) {
      throw new Error('Invalid pubsub network message envelope.');
    }

    return envelope.payload;
  }

  public encode(payload: string, network: IPFSNetwork, topic: string): string {
    if (network.isPrivate()) {
      return PrivateNetworkPubSubEnvelope.seal(
        this.networkKey(network),
        network.getId(),
        topic,
        payload,
      );
    }

    return JSON.stringify({
      encrypted: false,
      payload,
    } satisfies ClearEnvelope);
  }

  public decode(payload: string, network: IPFSNetwork, topic: string): string {
    if (network.isPrivate()) {
      return PrivateNetworkPubSubEnvelope.open(
        this.networkKey(network),
        network.getId(),
        topic,
        payload,
      );
    }

    return this.decodeClear(payload);
  }
}
