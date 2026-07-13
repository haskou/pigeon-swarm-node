import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import OrbitDBIdentityMetadataIndex from './OrbitDBIdentityMetadataIndex';

export default class OrbitDBIdentityMetadataProjection {
  private startPromise?: Promise<void>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly metadataIndex: OrbitDBIdentityMetadataIndex,
  ) {}

  public async start(): Promise<void> {
    this.startPromise ??= this.registry.onDocumentUpdated(
      'identities',
      (document) => this.metadataIndex.projectDocument(document),
    );

    await this.startPromise;
  }
}
