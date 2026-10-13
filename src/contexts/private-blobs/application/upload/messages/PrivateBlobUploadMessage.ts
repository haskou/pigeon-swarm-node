import { PrivateBlobId } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobId';
import { PrivateBlobUploadToken } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobUploadToken';
import { Readable } from 'stream';

export class PrivateBlobUploadMessage {
  public readonly blobId: PrivateBlobId;
  public readonly source: Readable;
  public readonly uploadToken: PrivateBlobUploadToken;

  constructor(blobId: string, uploadToken: string, source: Readable) {
    this.blobId = new PrivateBlobId(blobId);
    this.source = source;
    this.uploadToken = new PrivateBlobUploadToken(uploadToken);
  }
}
