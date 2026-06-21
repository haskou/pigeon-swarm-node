import IdentityRoutingRepublisher from '../../application/routing/IdentityRoutingRepublisher';
import IpfsIdentityRepository from './IpfsIdentityRepository';

export default class IpfsIdentityRouting extends IdentityRoutingRepublisher {
  constructor(private readonly repository: IpfsIdentityRepository) {
    super();
  }

  public republish(): Promise<number> {
    return this.repository.republishLocalRoutingRecords();
  }
}
