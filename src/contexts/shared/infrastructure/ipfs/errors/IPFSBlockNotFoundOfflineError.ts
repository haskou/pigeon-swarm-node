import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSBlockNotFoundOfflineError extends BaseError {
  constructor(cid: string) {
    super(`Block not found (offline): ${cid}`);
  }
}
