import OrbitDBKeychainMetadataProjection from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataProjection';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export default class OrbitDBKeychainMetadataProjectionRuntime implements Runtime {
  constructor(private readonly projection: OrbitDBKeychainMetadataProjection) {}

  public async run(): Promise<void> {
    await this.projection.start();
  }
}
