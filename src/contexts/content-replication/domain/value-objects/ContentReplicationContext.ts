import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidContentReplicationContextError } from '../errors/InvalidContentReplicationContextError';

export class ContentReplicationContext extends StringValueObject {
  public static readonly PUBLIC_UPLOAD = 'ipfs_public_upload';

  /**
   * Only public uploads are replicated. Private attachments never reach IPFS
   * (#290), so the former `ipfs_private_upload` context is refused.
   */
  public static isKnown(value: string): boolean {
    return value === ContentReplicationContext.PUBLIC_UPLOAD;
  }

  constructor(value: string | StringValueObject) {
    super(value);
    assert(
      ContentReplicationContext.isKnown(this.valueOf()),
      new InvalidContentReplicationContextError(this.valueOf()),
    );
  }
}
