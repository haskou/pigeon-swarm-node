import { PrivateBlobRangeRequest } from '@app/contexts/private-blobs/domain/PrivateBlobRangeRequest';
import { PrivateBlobDownloadToken } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobDownloadToken';
import { PrivateBlobId } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobId';

export class PrivateBlobReadMessage {
  public readonly blobId: PrivateBlobId;
  public readonly downloadToken: PrivateBlobDownloadToken;
  public readonly rangeRequest: PrivateBlobRangeRequest | undefined;

  constructor(
    blobId: string,
    downloadToken: string,
    rangeRequest: PrivateBlobRangeRequest | undefined,
  ) {
    this.blobId = new PrivateBlobId(blobId);
    this.downloadToken = new PrivateBlobDownloadToken(downloadToken);
    this.rangeRequest = rangeRequest;
  }
}
