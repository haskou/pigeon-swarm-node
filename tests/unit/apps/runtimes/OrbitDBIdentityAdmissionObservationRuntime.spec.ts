import OrbitDBIdentityAdmissionObservationRuntime from '@app/apps/runtimes/orbitdb-identity-admission-observation-runtime/OrbitDBIdentityAdmissionObservationRuntime';
import OrbitDBIdentityAdmissionObservationProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityAdmissionObservationProjection';
import { mock } from 'jest-mock-extended';

describe('OrbitDBIdentityAdmissionObservationRuntime', () => {
  it('starts the identity admission observation projection', async () => {
    const projection = mock<OrbitDBIdentityAdmissionObservationProjection>();
    const runtime = new OrbitDBIdentityAdmissionObservationRuntime(projection);

    await runtime.run();

    expect(projection.start).toHaveBeenCalledTimes(1);
  });
});
