import KeychainRoutingRepublisher from '../../application/routing/KeychainRoutingRepublisher';
import IpfsKeychainRepository from './IpfsKeychainRepository';

export default class IpfsKeychainRouting extends KeychainRoutingRepublisher {
  constructor(private readonly repository: IpfsKeychainRepository) {
    super();
  }

  public republish(): Promise<number> {
    return this.repository.republishLocalRoutingRecords();
  }
}
