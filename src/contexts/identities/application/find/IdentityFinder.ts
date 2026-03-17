import { Identity } from '../../domain/Identity';
import IdentityFinderService from '../../domain/services/IdentityFinderService';
import { IdentityFinderMessage } from './messages/IdentityFinderMessage';

export default class IdentityFinder {
  constructor(private readonly finder: IdentityFinderService) {}

  public async find(message: IdentityFinderMessage): Promise<Identity> {
    return this.finder.findById(message.identityId);
  }
}
