import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSContentNotFoundError extends BaseError {
  constructor(cid: string) {
    super(`Content with CID ${cid} not found in any network`);
  }
}
