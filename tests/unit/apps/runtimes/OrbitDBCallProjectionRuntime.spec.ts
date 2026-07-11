import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { mock } from 'jest-mock-extended';

describe('OrbitDBCallProjectionRuntime', () => {
  it('starts the call projection after OrbitDB stores are registered', async () => {
    const projection = mock<OrbitDBCallProjection>();

    await new OrbitDBCallProjectionRuntime(projection).run();

    expect(projection.start).toHaveBeenCalledTimes(1);
  });
});
