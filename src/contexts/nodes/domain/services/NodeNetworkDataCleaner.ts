import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export default abstract class NodeNetworkDataCleaner {
  public abstract clean(networkId: NetworkId): Promise<void>;
}
