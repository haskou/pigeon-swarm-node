import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import CallParticipantLeaseWarmUp from '@app/contexts/calls/infrastructure/memory/CallParticipantLeaseWarmUp';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { mock } from 'jest-mock-extended';

describe('OrbitDBCallProjectionRuntime', () => {
  it('starts the call projection after OrbitDB stores are registered', async () => {
    const projection = mock<OrbitDBCallProjection>();

    await new OrbitDBCallProjectionRuntime(
      projection,
      mock<CallParticipantLeaseWarmUp>(),
    ).run();

    expect(projection.start).toHaveBeenCalledTimes(1);
  });

  it('begins the participant lease warm-up once the call projection is ready', async () => {
    const projection = mock<OrbitDBCallProjection>();
    const warmUp = mock<CallParticipantLeaseWarmUp>();
    const { promise: started, resolve: finishStart } =
      Promise.withResolvers<void>();

    projection.start.mockReturnValue(started);
    const running = new OrbitDBCallProjectionRuntime(projection, warmUp).run();

    expect(warmUp.begin).not.toHaveBeenCalled();
    finishStart();
    await running;

    expect(warmUp.begin).toHaveBeenCalledTimes(1);
  });
});
