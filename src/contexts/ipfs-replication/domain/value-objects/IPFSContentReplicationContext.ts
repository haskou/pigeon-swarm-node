import { StringValueObject } from '@haskou/value-objects';

export class IPFSContentReplicationContext extends StringValueObject {
  public static readonly PUBLIC_UPLOAD = 'ipfs_public_upload';

  public isPublicUpload(): boolean {
    return this.valueOf() === IPFSContentReplicationContext.PUBLIC_UPLOAD;
  }
}
