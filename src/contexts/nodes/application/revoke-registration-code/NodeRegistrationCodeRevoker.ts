import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';
import { NodeRegistrationCodeRevokerMessage } from './messages/NodeRegistrationCodeRevokerMessage';

export default class NodeRegistrationCodeRevoker {
  constructor(private readonly repository: NodeRegistrationCodeRepository) {}

  public async revoke(
    message: NodeRegistrationCodeRevokerMessage,
  ): Promise<void> {
    await this.repository.remove(message.id);
  }
}
