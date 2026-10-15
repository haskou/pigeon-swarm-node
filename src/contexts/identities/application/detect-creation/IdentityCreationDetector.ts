import IdentityRepository from '../../domain/repositories/IdentityRepository';
import { IdentityCreationDetectorMessage } from './messages/IdentityCreationDetectorMessage';

/**
 * A publication creates an identity when it is a genesis (no previous
 * reference) of an identity this node does not hold yet. A genesis that
 * already replicated here is a republish.
 */
export default class IdentityCreationDetector {
  constructor(private readonly repository: IdentityRepository) {}

  public async isCreation(
    message: IdentityCreationDetectorMessage,
  ): Promise<boolean> {
    if (!message.identity.hasNoPreviousReference()) {
      return false;
    }

    return !(await this.repository.holds(message.identity.getId()));
  }
}
