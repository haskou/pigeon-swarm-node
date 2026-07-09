import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { Libp2pPubSubService } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubService';

describe('HeliaIPFS', () => {
  it('subscribes to the canonical pubsub message event only', async () => {
    const pubsub: Libp2pPubSubService = {
      addEventListener: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
    };
    const heliaCore = {
      libp2p: {
        addEventListener: jest.fn(),
        services: { pubsub },
      },
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });

    await ipfs.subscribePubSub('calls.v1.signal.sent', jest.fn());

    expect(pubsub.subscribe).toHaveBeenCalledWith(
      'calls.v1.signal.sent',
    );
    expect(pubsub.addEventListener).toHaveBeenCalledTimes(1);
    expect(pubsub.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });
});
