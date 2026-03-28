import BaseError from '@app/shared/domain/errors/BaseError';

export class IPFSBlockNotFoundPublicError extends BaseError {
  constructor(cid: string) {
    super(
      `Block not found (public): ${cid}`,
      IPFSBlockNotFoundPublicError.prototype,
    );
  }
}
