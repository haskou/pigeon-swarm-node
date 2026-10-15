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

  /**
   * Whether the publication would change what this node holds: a creation or
   * a version newer than the stored one. A replay of a held version does not.
   */
  public async isCreationOrNewerVersion(
    message: IdentityCreationDetectorMessage,
  ): Promise<boolean> {
    if (await this.isCreation(message)) {
      return true;
    }

    return message.identity.isNewerThan(
      await this.repository.findById(message.identity.getId()),
    );
  }
}
