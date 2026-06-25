import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSNetworkNotFoundError extends BaseError {
  constructor(networkName: string) {
    super(`Network '${networkName}' not found`);
  }
}
