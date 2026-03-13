import { Password } from '../../domain/value-objects/Password';
import { AbstractIPFS } from './AbstractIPFS';
import { PrivateIPFS } from './PrivateIPFS';
import { PublicIPFS } from './PublicIPFS';

export default class HeliaIPFS {
  public async getConnection(): Promise<AbstractIPFS> {
    const storageLocation = process.env.IPFS_STORAGE_PATH || './ipfs_storage';

    if (process.env.IPFS_PRIVATE_KEY) {
      return await PrivateIPFS.create({
        key: new Password(process.env.IPFS_PRIVATE_KEY),
        storageLocation,
      });
    }

    return await PublicIPFS.create({
      storageLocation,
    });
  }
}
