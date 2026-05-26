import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export interface NodeNetworkDataCleaner {
  clean(networkId: NetworkId): Promise<void>;
}
