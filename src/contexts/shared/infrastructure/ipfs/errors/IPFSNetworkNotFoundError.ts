import BaseError from '@app/shared/domain/errors/BaseError';

export class IPFSNetworkNotFoundError extends BaseError {
  constructor(networkName: string) {
    super(
      `Network '${networkName}' not found`,
      IPFSNetworkNotFoundError.prototype,
    );
  }
}
