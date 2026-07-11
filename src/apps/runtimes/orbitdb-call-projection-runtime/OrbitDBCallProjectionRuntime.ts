import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export default class OrbitDBCallProjectionRuntime implements Runtime {
  constructor(private readonly projection: OrbitDBCallProjection) {}

  public async run(): Promise<void> {
    await this.projection.start();
  }
}
