import ContentReplicationPolicy from '@app/contexts/content-replication/domain/ContentReplicationPolicy';

describe('ContentReplicationPolicy', () => {
  const policy = new ContentReplicationPolicy();

  it('should keep full replication while the network is small', () => {
    expect(policy.desiredReplicas(1)).toBe(1);
    expect(policy.desiredReplicas(2)).toBe(2);
    expect(policy.desiredReplicas(5)).toBe(5);
  });

  it('should keep generous margins when the network can distribute content', () => {
    expect(policy.desiredReplicas(6)).toBe(5);
    expect(policy.desiredReplicas(10)).toBe(5);
    expect(policy.desiredReplicas(20)).toBe(8);
  });

  it('should not release local replicas while the network is small', () => {
    expect(
      policy.canReleaseLocalReplica({
        activeNodeCount: 5,
        knownReplicaNodeIds: ['node-1', 'node-2', 'node-3'],
        localNodeId: 'node-4',
        responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
      }),
    ).toBe(false);
  });

  it('should not release local replicas from responsible nodes', () => {
    expect(
      policy.canReleaseLocalReplica({
        activeNodeCount: 10,
        knownReplicaNodeIds: ['node-1', 'node-2', 'node-3'],
        localNodeId: 'node-2',
        responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
      }),
    ).toBe(false);
  });

  it('should not release local replicas without a local replica claim', () => {
    expect(
      policy.canReleaseLocalReplica({
        activeNodeCount: 10,
        knownReplicaNodeIds: ['node-1', 'node-2', 'node-3'],
        localNodeId: 'node-4',
        responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
      }),
    ).toBe(false);
  });

  it('should not release local replicas before responsible nodes have claimed them', () => {
    expect(
      policy.canReleaseLocalReplica({
        activeNodeCount: 10,
        knownReplicaNodeIds: ['node-1', 'node-2', 'node-4'],
        localNodeId: 'node-4',
        responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
      }),
    ).toBe(false);
  });

  it('should release extra local replicas once responsible nodes have claimed them', () => {
    expect(
      policy.canReleaseLocalReplica({
        activeNodeCount: 10,
        knownReplicaNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
        localNodeId: 'node-4',
        responsibleNodeIds: ['node-1', 'node-2', 'node-3'],
      }),
    ).toBe(true);
  });
});
