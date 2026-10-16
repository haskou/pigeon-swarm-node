import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import {
  PrivateKey,
  PrivateNetworkKeys,
  PrivateNetworkRelayRecord,
  PrivateNetworkRelayRecordEnvelope,
} from '@haskou/pigeon-swarm-crypto';

export default class PrivateNetworkRelayRecordCodec {
  private static requireNetworkKey(network: IPFSNetwork): PrivateKey {
    const key = network.getConfig().getKey();

    if (!key) {
      throw new Error(
        `Network "${network.getId()}" cannot use private relay records without a private network key.`,
      );
    }

    return key;
  }

  public static fingerprint(network: IPFSNetwork): string {
    return PrivateNetworkKeys.fingerprint(
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network),
    );
  }

  public static lookupKey(network: IPFSNetwork): string {
    return PrivateNetworkKeys.relayLookupKey(
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network),
    );
  }

  public static seal(
    network: IPFSNetwork,
    relayRecord: PrivateNetworkRelayRecord,
  ): string {
    return PrivateNetworkRelayRecordEnvelope.seal(
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network),
      relayRecord,
    );
  }

  public static open(
    network: IPFSNetwork,
    envelope: string,
  ): PrivateNetworkRelayRecord | undefined {
    const networkKey =
      PrivateNetworkRelayRecordCodec.requireNetworkKey(network);

    try {
      return PrivateNetworkRelayRecordEnvelope.open(networkKey, envelope);
    } catch {
      return undefined;
    }
  }
}
