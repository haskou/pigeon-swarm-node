import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidContentReplicationContextError } from '../errors/InvalidContentReplicationContextError';

export class ContentReplicationContext extends StringValueObject {
  public static readonly PRIVATE_UPLOAD = 'ipfs_private_upload';
  public static readonly PUBLIC_UPLOAD = 'ipfs_public_upload';

  public static isKnown(value: string): boolean {
    return [
      ContentReplicationContext.PRIVATE_UPLOAD,
      ContentReplicationContext.PUBLIC_UPLOAD,
    ].includes(value);
  }

  constructor(value: string | StringValueObject) {
    super(value);
    assert(
      ContentReplicationContext.isKnown(this.valueOf()),
      new InvalidContentReplicationContextError(this.valueOf()),
    );
  }

  public isPublicUpload(): boolean {
    return this.valueOf() === ContentReplicationContext.PUBLIC_UPLOAD;
  }

  public isReplicatedAsBytes(): boolean {
    return this.isPublicUpload();
  }
}
