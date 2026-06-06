export type NetworkReplicationStatus = {
  activeNodeCount: number;
  desiredReplicas: number;
  knownReplicaNodeIds: string[];
  knownReplicas: number;
  localResponsible: boolean;
  networkId: string;
  releaseLocalReplica: boolean;
  responsibleNodeIds: string[];
};
