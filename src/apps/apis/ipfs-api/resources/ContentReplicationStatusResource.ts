export type ContentReplicationStatusResource = {
  localNodeId: string;
  summary: {
    contentCount: number;
    localResponsibleCount: number;
    releasableCount: number;
    totalSizeBytes: number;
    updatedAt: number;
  };
};
