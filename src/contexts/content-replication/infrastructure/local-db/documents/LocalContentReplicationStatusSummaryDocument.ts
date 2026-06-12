export interface LocalContentReplicationStatusSummaryDocument extends Record<
  string,
  unknown
> {
  _id: string;
  contentCount: number;
  localResponsibleCount: number;
  releasableCount: number;
  totalSizeBytes: number;
  updatedAt: number;
}
