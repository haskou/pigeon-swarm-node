import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import OrbitDBKeychainMetadataIndex from './OrbitDBKeychainMetadataIndex';

export default class OrbitDBKeychainMetadataProjection {
  private startPromise?: Promise<void>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly metadataIndex: OrbitDBKeychainMetadataIndex,
  ) {}

  public async start(): Promise<void> {
    this.startPromise ??= this.registry.onDocumentUpdated(
      'keychains',
      (document) => this.metadataIndex.projectDocument(document),
    );

    await this.startPromise;
  }
}
