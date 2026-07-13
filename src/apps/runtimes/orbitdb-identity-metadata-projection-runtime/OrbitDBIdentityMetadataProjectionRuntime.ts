import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export default class OrbitDBIdentityMetadataProjectionRuntime implements Runtime {
  constructor(private readonly projection: OrbitDBIdentityMetadataProjection) {}

  public async run(): Promise<void> {
    await this.projection.start();
  }
}
