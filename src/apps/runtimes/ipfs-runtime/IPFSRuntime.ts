import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

export default class IPFSRuntime {
  constructor(private readonly ipfs: IPFS) {}

  public async run(): Promise<void> {
    await this.ipfs.initialize();
  }
}
