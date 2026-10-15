import IdentityRepository from '../../domain/repositories/IdentityRepository';
import { IdentityCreationDetectorMessage } from './messages/IdentityCreationDetectorMessage';

/**
 * A publication creates an identity on this node when this node does not hold
 * that identity yet, whatever its version: a later version whose genesis lives
 * elsewhere still brings a new identity here. Anything already replicated here
 * is a republish or an update.
 */
export default class IdentityCreationDetector {
  constructor(private readonly repository: IdentityRepository) {}

  public async isCreation(
    message: IdentityCreationDetectorMessage,
  ): Promise<boolean> {
    return !(await this.repository.holds(message.identity.getId()));
  }
}
