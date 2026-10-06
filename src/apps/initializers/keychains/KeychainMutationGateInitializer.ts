import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import { OrbitDBKeychainMutationGate } from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMutationGate';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

export default class KeychainMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly signatures: KeychainSignatureDomainService,
    private readonly mapper: IpfsKeychainMapper,
    private readonly ipfsManager: IPFS,
  ) {}

  public ensure(): Promise<void> {
    this.registry.addMutationGate(
      new OrbitDBKeychainMutationGate(
        this.signatures,
        this.mapper,
        this.ipfsManager,
      ),
    );

    return Promise.resolve();
  }
}
