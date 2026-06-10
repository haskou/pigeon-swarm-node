import { StringValueObject } from '@haskou/value-objects';

export class ContentReplicationContext extends StringValueObject {
  public static readonly PUBLIC_UPLOAD = 'ipfs_public_upload';

  public isPublicUpload(): boolean {
    return this.valueOf() === ContentReplicationContext.PUBLIC_UPLOAD;
  }
}
