import BaseError from '@app/shared/domain/errors/BaseError';

export class IPFSContentNotFoundError extends BaseError {
  constructor(cid: string) {
    super(
      `Content with CID ${cid} not found in any network`,
      IPFSContentNotFoundError.prototype,
    );
  }
}
