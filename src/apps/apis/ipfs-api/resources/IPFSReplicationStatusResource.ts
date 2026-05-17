export type IPFSReplicationStatusResource = {
  contents: Array<{
    cid: string;
    context: string;
    createdAt: number;
    networks: Array<{
      activeNodeCount: number;
      desiredReplicas: number;
      knownReplicaNodeIds: string[];
      knownReplicas: number;
      localResponsible: boolean;
      networkId: string;
      releaseLocalReplica: boolean;
      responsibleNodeIds: string[];
    }>;
    ownerIdentityId?: string;
    priority: string;
    sizeBytes: number;
    updatedAt: number;
  }>;
  localNodeId: string;
};
