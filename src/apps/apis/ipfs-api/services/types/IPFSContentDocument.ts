export type IPFSContentDocument = {
  contentType: string;
  data?: string;
  encrypted?: true;
  encryptedData?: string;
  filename?: string;
  size: number;
  uploadedAt: number;
  uploadedByIdentityId: string;
};
