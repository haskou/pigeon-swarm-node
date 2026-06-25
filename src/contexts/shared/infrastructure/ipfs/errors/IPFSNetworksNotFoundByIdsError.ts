import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSNetworksNotFoundByIdsError extends BaseError {
  constructor(networkIds: string[]) {
    super(`No networks found for provided IDs: ${networkIds.join(', ')}`);
  }
}
