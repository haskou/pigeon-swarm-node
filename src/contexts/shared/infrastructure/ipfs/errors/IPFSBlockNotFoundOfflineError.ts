import BaseError from '@app/shared/domain/errors/BaseError';

export class IPFSBlockNotFoundOfflineError extends BaseError {
  constructor(cid: string) {
    super(
      `Block not found (offline): ${cid}`,
      IPFSBlockNotFoundOfflineError.prototype,
    );
  }
}
