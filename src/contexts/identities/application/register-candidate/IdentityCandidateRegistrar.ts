import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { RegisterIdentityCandidateMessage } from './messages/RegisterIdentityCandidateMessage';

export default class IdentityCandidateRegistrar {
  constructor(private readonly repository: IdentityRepository) {}

  public async register(
    message: RegisterIdentityCandidateMessage,
  ): Promise<void> {
    await this.repository.findByExternalIdentifier(message.externalIdentifier);
  }
}
