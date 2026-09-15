import OrbitDBCommunityReplicaProjection from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityReplicaProjection';

export default class CommunityReplicationInitializer {
  constructor(private readonly projection: OrbitDBCommunityReplicaProjection) {}

  public ensure(): Promise<void> {
    this.projection.register();

    return Promise.resolve();
  }
}
