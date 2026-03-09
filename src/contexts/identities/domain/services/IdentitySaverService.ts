import { IdentityRepository } from '../repositories/IdentityRepository';
import { Identity } from '../Identity';

// TODO: Test
export default class IdentitySaverService {
  constructor(private readonly repository: IdentityRepository) {}

  public async save(identity: Identity): Promise<void> {
    await this.repository.save(identity);
  }
}
