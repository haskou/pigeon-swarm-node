import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainError } from '@haskou/value-objects';

export class NodeNetworkNotFoundError extends DomainError {
  constructor(networkId: NetworkId) {
    super(`Node network ${networkId.valueOf()} not found.`);
  }
}
