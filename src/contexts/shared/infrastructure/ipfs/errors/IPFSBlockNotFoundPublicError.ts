import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSBlockNotFoundPublicError extends BaseError {
  constructor(cid: string) {
    super(`Block not found (public): ${cid}`);
  }
}
