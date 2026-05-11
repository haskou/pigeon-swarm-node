import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { Identity } from '../../domain/Identity';
import IdentityFinderService from '../../domain/services/IdentityFinderService';
import { IdentityFinderMessage } from './messages/IdentityFinderMessage';

export default class IdentityFinder {
  constructor(private readonly finder: IdentityFinderService) {}

  public async find(message: IdentityFinderMessage): Promise<Identity> {
    if (message.identityId) {
      return this.finder.findById(message.identityId);
    }

    if (message.handle) {
      return this.finder.findByHandle(message.handle);
    }

    throw new IdentityNotFoundError('');
  }
}
