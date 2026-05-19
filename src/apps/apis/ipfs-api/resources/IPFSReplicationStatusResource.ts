export type IPFSReplicationStatusResource = {
  localNodeId: string;
  summary: {
    contentCount: number;
    localResponsibleCount: number;
    releasableCount: number;
    totalSizeBytes: number;
    updatedAt: number;
  };
};
