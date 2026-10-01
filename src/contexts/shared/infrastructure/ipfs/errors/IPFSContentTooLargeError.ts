import { BaseError } from '@haskou/ddd-kernel/domain';

export class IPFSContentTooLargeError extends BaseError {
  constructor(cid: string, maxBytes: number) {
    super(`Content with CID ${cid} exceeds the ${maxBytes} byte limit`);
  }
}
