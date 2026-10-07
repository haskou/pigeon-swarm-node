import { OrbitDBIdentityMutationGate } from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMutationGate';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

export default class IdentityMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly ipfsManager: IPFS,
  ) {}

  public ensure(): Promise<void> {
    this.registry.addMutationGate(
      new OrbitDBIdentityMutationGate(this.ipfsManager),
    );

    return Promise.resolve();
  }
}
