import BaseError from '@app/shared/domain/errors/BaseError';

export class IPFSNetworksNotFoundByIdsError extends BaseError {
  constructor(networkIds: string[]) {
    super(
      `No networks found for provided IDs: ${networkIds.join(', ')}`,
      IPFSNetworksNotFoundByIdsError.prototype,
    );
  }
}
