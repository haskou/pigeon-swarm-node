import NodeHeartbeatSender from '@app/contexts/nodes/application/send-heartbeat/NodeHeartbeatSender';
import { Node } from '@app/contexts/nodes/domain/Node';
import { Network } from '@app/contexts/nodes/domain/Network';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NetworkKey } from '@app/contexts/nodes/domain/value-objects/NetworkKey';
import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { KeyPair, UUID } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeHeartbeatSender', () => {
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let nodeRepository: MockProxy<NodeRepository>;
  let sender: NodeHeartbeatSender;

  beforeEach(() => {
    eventPublisher = mock<DomainEventPublisher>();
    nodeRepository = mock<NodeRepository>();
    sender = new NodeHeartbeatSender(nodeRepository, eventPublisher);
  });

  it('publishes a heartbeat without private network keys', async () => {
    const keyPair = await KeyPair.generate();
    const { privateKey } = generateKeyPairSync('ed25519');
    const owner = new IdentityId(keyPair.toPrimitives().publicKey);
    const networkId = UUID.generate().valueOf();
    const node = new Node(
      new NodeId(UUID.generate().valueOf()),
      new Map([
        [
          new NetworkId(networkId),
          new Network(
            new NetworkId(networkId),
            new NetworkName('private'),
            new NetworkKey(
              privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
            ),
          ),
        ],
      ]),
      owner,
    );

    nodeRepository.loadLocalNode.mockResolvedValue(node);

    await sender.send();

    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(NodeHeartbeatWasSent),
    ]);

    const event = eventPublisher.publish.mock.calls[0][0][0];

    expect(event.aggregateId).toBe(node.toPrimitives().id);
    expect(event.attributes).toEqual({
      networks: [
        {
          id: networkId,
          name: 'private',
          type: 'private',
        },
      ],
      owner: owner.valueOf(),
    });
  });
});
