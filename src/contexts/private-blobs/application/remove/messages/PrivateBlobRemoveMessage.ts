import { PrivateBlobId } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobId';
import { PrivateBlobUploadToken } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobUploadToken';

export class PrivateBlobRemoveMessage {
  public readonly blobId: PrivateBlobId;
  public readonly uploadToken: PrivateBlobUploadToken;

  constructor(blobId: string, uploadToken: string) {
    this.blobId = new PrivateBlobId(blobId);
    this.uploadToken = new PrivateBlobUploadToken(uploadToken);
  }
}
