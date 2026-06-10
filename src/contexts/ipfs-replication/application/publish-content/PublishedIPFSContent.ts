export type PublishedIPFSContent = {
  cid: string;
  contentType: string;
  encrypted?: true;
  filename?: string;
  size: number;
};
