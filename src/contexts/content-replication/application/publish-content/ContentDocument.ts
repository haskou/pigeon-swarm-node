export type ContentDocument = {
  contentType: string;
  encrypted?: true;
  encryptedData?: string;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
};
