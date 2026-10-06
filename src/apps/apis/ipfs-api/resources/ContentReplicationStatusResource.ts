export type ContentReplicationStatusResource = {
  localNodeId: string;
  summary: {
    contentCount: number;
    localResponsibleCount: number;
    totalSizeBytes: number;
    updatedAt: number;
  };
};
