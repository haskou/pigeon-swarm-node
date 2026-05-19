export interface MongoIPFSReplicationStatusSummaryDocument {
  _id: string;
  contentCount: number;
  localResponsibleCount: number;
  releasableCount: number;
  totalSizeBytes: number;
  updatedAt: number;
}
