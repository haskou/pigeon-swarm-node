import IpfsIdentityRepository from './IpfsIdentityRepository';

export default class IpfsIdentityRouting {
  constructor(private readonly repository: IpfsIdentityRepository) {}

  public republish(networkId?: string): Promise<number> {
    return this.repository.republishLocalRoutingRecords(networkId);
  }
}
