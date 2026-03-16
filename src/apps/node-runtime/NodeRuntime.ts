import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import Kernel from '@app/Kernel';

export class NodeRuntime {
  private readonly ipfs: IPFS = Kernel.di.getService(IPFS);
  constructor() {}

  public async run(): Promise<void> {
    await this.ipfs.initialize();
  }
}
