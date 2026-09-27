import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import PrivateAuthorizationFrameConsumer from '@app/apps/consumers/private-authorization-consumer/PrivateAuthorizationFrameConsumer';

describe('PrivateAuthorizationFrameConsumer', () => {
  const message = new PrivateOperationAcceptMessage('operation', 'proof');
  const acceptor = {
    accept: jest.fn(),
  } as unknown as jest.Mocked<PrivateOperationAcceptor>;
  const consumer = new PrivateAuthorizationFrameConsumer(acceptor);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['accepted', true],
    ['duplicate', true],
    ['pending', false],
  ] as const)('acknowledges %s only after durable acceptance', async (status, ack) => {
    acceptor.accept.mockResolvedValue({ status });

    await expect(consumer.consume(message)).resolves.toBe(ack);
  });

  it('leaves a rejected frame unacknowledged', async () => {
    acceptor.accept.mockRejectedValue(new Error('invalid'));

    await expect(consumer.consume(message)).rejects.toThrow('invalid');
  });
});
