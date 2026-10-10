export interface PrivateBlobPrimitives {
  createdAt: number;
  downloadTokenHash: string;
  /** Upload deadline while reserved; retention deadline once stored. */
  expiresAt: number;
  id: string;
  ownerKey: string;
  retentionMs: number;
  size: number;
  state: 'reserved' | 'stored';
  uploadTokenHash: string;
}
