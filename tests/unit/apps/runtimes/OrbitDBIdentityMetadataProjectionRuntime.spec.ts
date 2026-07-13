import OrbitDBIdentityMetadataProjectionRuntime from '@app/apps/runtimes/orbitdb-identity-metadata-projection-runtime/OrbitDBIdentityMetadataProjectionRuntime';
import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import { mock } from 'jest-mock-extended';

describe('OrbitDBIdentityMetadataProjectionRuntime', () => {
  it('starts the identity metadata projection', async () => {
    const projection = mock<OrbitDBIdentityMetadataProjection>();
    const runtime = new OrbitDBIdentityMetadataProjectionRuntime(projection);

    await runtime.run();

    expect(projection.start).toHaveBeenCalledTimes(1);
  });
});
