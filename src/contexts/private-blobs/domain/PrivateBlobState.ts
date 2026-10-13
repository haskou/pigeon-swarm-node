import { Timestamp } from '@haskou/value-objects';

import { PrivateBlobId } from './value-objects/PrivateBlobId';
import { PrivateBlobSize } from './value-objects/PrivateBlobSize';
import { PrivateBlobStatus } from './value-objects/PrivateBlobStatus';

export interface PrivateBlobState {
  createdAt: Timestamp;
  downloadTokenHash: string;
  /** Upload deadline while reserved; retention deadline once stored. */
  expiresAt: Timestamp;
  id: PrivateBlobId;
  ownerKey: string;
  retentionMs: number;
  size: PrivateBlobSize;
  status: PrivateBlobStatus;
  uploadTokenHash: string;
}
