import { Duration, Timestamp } from '@haskou/value-objects';

import { PrivateBlobDownloadTokenHash } from './value-objects/PrivateBlobDownloadTokenHash';
import { PrivateBlobId } from './value-objects/PrivateBlobId';
import { PrivateBlobOwnerKey } from './value-objects/PrivateBlobOwnerKey';
import { PrivateBlobSize } from './value-objects/PrivateBlobSize';
import { PrivateBlobStatus } from './value-objects/PrivateBlobStatus';
import { PrivateBlobUploadTokenHash } from './value-objects/PrivateBlobUploadTokenHash';

export interface PrivateBlobState {
  createdAt: Timestamp;
  downloadTokenHash: PrivateBlobDownloadTokenHash;
  /** Upload deadline while reserved; retention deadline once stored. */
  expiresAt: Timestamp;
  id: PrivateBlobId;
  ownerKey: PrivateBlobOwnerKey;
  retention: Duration;
  size: PrivateBlobSize;
  status: PrivateBlobStatus;
  uploadTokenHash: PrivateBlobUploadTokenHash;
}
