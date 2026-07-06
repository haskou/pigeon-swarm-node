import IpfsKeychainRepository from './IpfsKeychainRepository';

export default class IpfsKeychainRouting {
  constructor(private readonly repository: IpfsKeychainRepository) {}

  public republish(networkId?: string): Promise<number> {
    return this.repository.republishLocalRoutingRecords(networkId);
  }
}
