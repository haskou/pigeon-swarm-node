import IpfsIdentityRepository from './IpfsIdentityRepository';

export default class IpfsIdentityRouting {
  constructor(private readonly repository: IpfsIdentityRepository) {}

  public republish(): Promise<number> {
    return this.repository.republishLocalRoutingRecords();
  }
}
