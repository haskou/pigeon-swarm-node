import CallParticipantLeaseWarmUp from '@app/contexts/calls/infrastructure/memory/CallParticipantLeaseWarmUp';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';

export default class OrbitDBCallProjectionRuntime implements Runtime {
  constructor(
    private readonly projection: OrbitDBCallProjection,
    private readonly leaseWarmUp: CallParticipantLeaseWarmUp,
  ) {}

  public async run(): Promise<void> {
    await this.projection.start();
    this.leaseWarmUp.begin();
  }
}
