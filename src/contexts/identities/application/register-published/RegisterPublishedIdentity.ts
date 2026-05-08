import { Identity } from '../../domain/Identity';
import IdentityRegistrarService from '../../domain/services/IdentityRegistrarService';
import { RegisterPublishedIdentityMessage } from './messages/RegisterPublishedIdentityMessage';

export default class RegisterPublishedIdentity {
  constructor(private readonly registrar: IdentityRegistrarService) {}

  public async register(
    message: RegisterPublishedIdentityMessage,
  ): Promise<Identity> {
    return this.registrar.register(message.identityId);
  }
}
