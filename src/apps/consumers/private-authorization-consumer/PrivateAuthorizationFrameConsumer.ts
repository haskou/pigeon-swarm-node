import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';

export default class PrivateAuthorizationFrameConsumer {
  public constructor(private readonly acceptor: PrivateOperationAcceptor) {}

  public async consume(
    message: PrivateOperationAcceptMessage,
  ): Promise<boolean> {
    const result = await this.acceptor.accept(message);

    return result.status !== 'pending';
  }
}
