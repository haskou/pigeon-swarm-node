import OrbitDBIdentityAdmissionObservationProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityAdmissionObservationProjection';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export default class OrbitDBIdentityAdmissionObservationRuntime implements Runtime {
  constructor(
    private readonly projection: OrbitDBIdentityAdmissionObservationProjection,
  ) {}

  public async run(): Promise<void> {
    await this.projection.start();
  }
}
