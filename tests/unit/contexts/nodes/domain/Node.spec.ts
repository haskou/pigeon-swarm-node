import { NodeCannotHaveMoreThanOnePublicNetworkError } from '@app/contexts/nodes/domain/errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeNetworkNotFoundError } from '@app/contexts/nodes/domain/errors/NodeNetworkNotFoundError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { NodeIsAlreadyOwnedByThisIdentityError } from '@app/contexts/nodes/domain/errors/NodeIsAlreadyOwnedByThisIdentityError';
import { NodeNetworkWasAdded } from '@app/contexts/nodes/domain/events/NodeNetworkWasAdded';
import { NodeNetworkWasRemoved } from '@app/contexts/nodes/domain/events/NodeNetworkWasRemoved';
import { NodeRegistrationModeWasChanged } from '@app/contexts/nodes/domain/events/NodeRegistrationModeWasChanged';
import { NodeRelayConfigurationWasUpdated } from '@app/contexts/nodes/domain/events/NodeRelayConfigurationWasUpdated';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';

import { IdentityMother } from '../../../mothers/IdentityMother';
import { NetworkMother } from '../../../mothers/NetworkMother';
import { NodeMother } from '../../../mothers/NodeMother';

describe('Node', () => {
  let mother: NodeMother;
  let networkMother: NetworkMother;
  let node: Node;
  let primitives: PrimitiveOf<Node>;

  const generateIdentityId = (): IdentityId => {
    const { publicKey } = generateKeyPairSync('ed25519');

    return new IdentityId(
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    );
  };

  beforeEach(() => {
    mother = new NodeMother();
    networkMother = new NetworkMother();
    node = mother.build();
    primitives = {
      id: mother.id.valueOf(),
      networks: Object.fromEntries(
        Array.from(mother.networks.entries()).map(([key, network]) => [
          key.valueOf(),
          network.toPrimitives(),
        ]),
      ),
      owner: mother.owner?.valueOf(),
      registrationMode: 'open',
      relayConfiguration: NodeRelayConfiguration.default().toPrimitives(),
    };
  });

  describe('fromPrimitives', () => {
    it('should create a node from primitives', () => {
      const created = Node.fromPrimitives(primitives);

      expect(created.toPrimitives()).toEqual(primitives);
    });
  });

  describe('toPrimitives', () => {
    it('should return the correct primitives', () => {
      const result = node.toPrimitives();

      expect(result).toEqual(primitives);
    });
  });

  describe('addNetwork', () => {
    it('should add a network and record a NodeNetworkWasAdded event', () => {
      const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
      const network = networkMother.withId(networkId).withoutKey().build();

      node.addNetwork(network);

      const result = node.toPrimitives();
      expect(result.networks[networkId.valueOf()]).toEqual(
        network.toPrimitives(),
      );
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeNetworkWasAdded),
      ]);
    });

    it('should throw when adding a second public network', () => {
      const firstPublic = networkMother
        .withId(NetworkId.generate())
        .withoutKey()
        .build();
      const secondPublic = new NetworkMother()
        .withId(NetworkId.generate())
        .withoutKey()
        .build();

      node.addNetwork(firstPublic);

      expect(() => node.addNetwork(secondPublic)).toThrow(
        NodeCannotHaveMoreThanOnePublicNetworkError,
      );
    });
  });

  describe('removeNetwork', () => {
    it('should remove a network and record a NodeNetworkWasRemoved event', () => {
      const networkId = NetworkId.generate();
      const network = networkMother.withId(networkId).withoutKey().build();

      node.addNetwork(network);
      node.pullDomainEvents();
      node.removeNetwork(networkId);

      expect(node.toPrimitives().networks[networkId.valueOf()]).toBeUndefined();
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeNetworkWasRemoved),
      ]);
    });

    it('should remove a network even when the map key is a different value object instance', () => {
      const networkId = NetworkId.generate();
      const network = networkMother.withId(networkId).withoutKey().build();
      const restored = Node.fromPrimitives({
        id: mother.id.valueOf(),
        networks: {
          [networkId.valueOf()]: network.toPrimitives(),
        },
        owner: undefined,
        registrationMode: 'open',
        relayConfiguration: NodeRelayConfiguration.default().toPrimitives(),
      });

      restored.removeNetwork(new NetworkId(networkId.valueOf()));

      expect(restored.toPrimitives().networks).toEqual({});
    });

    it('should throw when removing an unknown network', () => {
      expect(() => node.removeNetwork(NetworkId.generate())).toThrow(
        NodeNetworkNotFoundError,
      );
    });
  });

  describe('assignOwner', () => {
    it('should assign the node owner', () => {
      const owner = new IdentityMother().id;

      node.assignOwner(owner, owner);

      expect(node.toPrimitives().owner).toBe(owner.valueOf());
    });

    it('should allow the current owner to change the node owner', () => {
      const owner = new IdentityMother().id;
      const nextOwner = generateIdentityId();

      node.assignOwner(owner, owner);
      node.assignOwner(nextOwner, owner);

      expect(node.toPrimitives().owner).toBe(nextOwner.valueOf());
    });

    it('should reject changing the node owner by another identity', () => {
      const owner = new IdentityMother().id;
      const anotherIdentity = generateIdentityId();
      const nextOwner = generateIdentityId();

      node.assignOwner(owner, owner);

      expect(() => node.assignOwner(nextOwner, anotherIdentity)).toThrow(
        NodeOwnerCanOnlyBeChangedByCurrentOwnerError,
      );
    });
  });

  describe('replaceLostOwner', () => {
    it('should install the new owner and open registration but keep the rest', () => {
      const owner = new IdentityMother().id;
      const newOwner = generateIdentityId();
      const claimed = new NodeMother()
        .withNetwork(networkMother.id, networkMother.build())
        .withOwner(owner)
        .withRegistrationMode(NodeRegistrationMode.CODES)
        .build();
      const before = claimed.toPrimitives();

      const cleared = claimed.replaceLostOwner(newOwner);

      expect(cleared.map((setting) => setting.valueOf())).toEqual([
        'previous node owner',
        'registration mode codes (now open)',
      ]);
      expect(claimed.isOwnedBy(newOwner)).toBe(true);
      expect(claimed.isOwnedBy(owner)).toBe(false);
      expect(claimed.isOpenForRegistration()).toBe(true);
      expect(claimed.toPrimitives()).toEqual({
        ...before,
        owner: newOwner.valueOf(),
        registrationMode: 'open',
      });
    });

    it('should install an owner on a node that has none', () => {
      const newOwner = generateIdentityId();

      expect(node.replaceLostOwner(newOwner)).toEqual([]);
      expect(node.isOwnedBy(newOwner)).toBe(true);
    });

    it('should refuse the identity that already owns the node', () => {
      const owner = new IdentityMother().id;
      const claimed = new NodeMother()
        .withOwner(owner)
        .withRegistrationMode(NodeRegistrationMode.CLOSED)
        .build();
      const before = claimed.toPrimitives();

      expect(() => claimed.replaceLostOwner(new IdentityId(owner))).toThrow(
        NodeIsAlreadyOwnedByThisIdentityError,
      );
      expect(claimed.toPrimitives()).toEqual(before);
    });

    it('should record no replicated event, the replacement is local to the host', () => {
      const claimed = new NodeMother()
        .withOwner(new IdentityMother().id)
        .withRegistrationMode(NodeRegistrationMode.CLOSED)
        .build();

      claimed.replaceLostOwner(generateIdentityId());

      expect(claimed.pullDomainEvents()).toEqual([]);
    });

    it('should refuse another identity claiming the node after the replacement', () => {
      const newOwner = generateIdentityId();
      const other = generateIdentityId();

      node.replaceLostOwner(newOwner);

      expect(() => node.assignOwner(other, other)).toThrow(
        NodeOwnerCanOnlyBeChangedByCurrentOwnerError,
      );
    });
  });

  describe('updateRelayConfiguration', () => {
    it('should update relay configuration and record a domain event', () => {
      const relayConfiguration = NodeRelayConfiguration.fromPrimitives({
        callsRelay: {
          port: 4199,
        },
        manualRelayMultiaddrs: [
          '/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelayPeerId',
        ],
        privateRelay: {
          enabled: true,
          portEnd: 4199,
          portStart: 4100,
          publicRecordDiscoveryEnabled: true,
          publicRecordPublicationEnabled: true,
        },
        publicHost: 'relay.example.com',
        publicRelay: {
          autoEnabled: false,
          discoveryEnabled: true,
          enabled: true,
          libp2pPort: 4001,
          port: 4011,
        },
      });

      node.updateRelayConfiguration(relayConfiguration);

      expect(node.toPrimitives().relayConfiguration).toEqual(
        relayConfiguration.toPrimitives(),
      );
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeRelayConfigurationWasUpdated),
      ]);
    });
  });

  describe('changeRegistrationMode', () => {
    it('should be open for registration by default', () => {
      expect(node.isOpenForRegistration()).toBe(true);
      expect(node.isClosedForRegistration()).toBe(false);
      expect(node.toPrimitives().registrationMode).toBe('open');
    });

    it('should change the registration mode and record a domain event', () => {
      node.changeRegistrationMode(NodeRegistrationMode.CLOSED);

      expect(node.isClosedForRegistration()).toBe(true);
      expect(node.isOpenForRegistration()).toBe(false);
      const events = node.pullDomainEvents();

      expect(events).toEqual([expect.any(NodeRegistrationModeWasChanged)]);
      expect(events[0].attributes).toEqual({ registrationMode: 'closed' });
    });

    it('should neither be open nor closed in codes mode', () => {
      node.changeRegistrationMode(NodeRegistrationMode.CODES);

      expect(node.isOpenForRegistration()).toBe(false);
      expect(node.isClosedForRegistration()).toBe(false);
    });

    it('should not record an event when the mode does not change', () => {
      node.changeRegistrationMode(NodeRegistrationMode.OPEN);

      expect(node.pullDomainEvents()).toEqual([]);
    });
  });
});
