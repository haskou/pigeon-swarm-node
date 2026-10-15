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
   * Whether this node already stores exactly this record, checked locally so
   * a record fetchable from a peer does not count. Only such a replay
   * changes nothing here; any other record, even an equal or older version,
   * can fork what this node serves.
   */
  public async holdsRecord(
    message: IdentityCreationDetectorMessage,
  ): Promise<boolean> {
    return await this.repository.holdsVersion(
      message.identity.getId(),
      await this.repository.calculateExternalIdentifier(message.identity),
    );
  }
}
