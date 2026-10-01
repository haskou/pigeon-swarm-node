import { Identity } from '../Identity';
import IdentityRepository from '../repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

export default class IdentitySaverService {
  constructor(private readonly repository: IdentityRepository) {}

  public calculateExternalIdentifier(
    identity: Identity,
  ): Promise<IdentityExternalIdentifier> {
    return this.repository.calculateExternalIdentifier(identity);
  }

  public async save(identity: Identity): Promise<IdentityExternalIdentifier> {
    return this.repository.save(identity);
  }
}
