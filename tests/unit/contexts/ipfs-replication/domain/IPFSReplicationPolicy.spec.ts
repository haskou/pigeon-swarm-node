import { IPFSReplicationPolicy } from '@app/contexts/ipfs-replication/domain/IPFSReplicationPolicy';

describe('IPFSReplicationPolicy', () => {
  const policy = new IPFSReplicationPolicy();

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
});
