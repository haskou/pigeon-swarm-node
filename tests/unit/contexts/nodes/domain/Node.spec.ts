import { NodeCannotHaveMoreThanOnePublicNetworkError } from '@app/contexts/nodes/domain/errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeCanOnlyBeManagedByItsOwnerError } from '@app/contexts/nodes/domain/errors/NodeCanOnlyBeManagedByItsOwnerError';
import { NodeIsAlreadyOwnedByThisIdentityError } from '@app/contexts/nodes/domain/errors/NodeIsAlreadyOwnedByThisIdentityError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { NodeOwnerResetIsRequiredError } from '@app/contexts/nodes/domain/errors/NodeOwnerResetIsRequiredError';
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

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
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
      ownerResetRequired: false,
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

      node.addNetwork(network, undefined);

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

      node.addNetwork(firstPublic, undefined);

      expect(() => node.addNetwork(secondPublic, undefined)).toThrow(
        NodeCannotHaveMoreThanOnePublicNetworkError,
      );
    });

    it('should let only the owner add a network once the node is claimed', () => {
      const owner = IdentityIdMother.canonical();
      const claimed = mother.withOwner(owner).build();
      const network = networkMother.withId(NetworkId.generate()).build();

      expect(() =>
        claimed.addNetwork(network, IdentityIdMother.canonical()),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(() => claimed.addNetwork(network, undefined)).toThrow(
        NodeCanOnlyBeManagedByItsOwnerError,
      );
      expect(claimed.toPrimitives().networks).toEqual({});

      claimed.addNetwork(network, owner);

      expect(Object.keys(claimed.toPrimitives().networks)).toEqual([
        network.getId().valueOf(),
      ]);
    });
  });

  describe('removeNetwork', () => {
    let owner: IdentityId;

    beforeEach(() => {
      owner = IdentityIdMother.canonical();
      node = mother.withOwner(owner).build();
    });

    it('should remove a network and record a NodeNetworkWasRemoved event', () => {
      const networkId = NetworkId.generate();
      const network = networkMother.withId(networkId).withoutKey().build();

      node.addNetwork(network, owner);
      node.pullDomainEvents();
      node.removeNetwork(networkId, owner);

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
        owner: owner.valueOf(),
        registrationMode: 'open',
        relayConfiguration: NodeRelayConfiguration.default().toPrimitives(),
      });

      restored.removeNetwork(new NetworkId(networkId.valueOf()), owner);

      expect(restored.toPrimitives().networks).toEqual({});
    });

    it('should throw when removing an unknown network', () => {
      expect(() => node.removeNetwork(NetworkId.generate(), owner)).toThrow(
        NodeNetworkNotFoundError,
      );
    });

    it('should let only the owner remove a network', () => {
      const networkId = NetworkId.generate();
      const unclaimed = new NodeMother()
        .withNetwork(networkId, networkMother.withId(networkId).build())
        .build();

      node.addNetwork(networkMother.withId(networkId).build(), owner);

      expect(() =>
        node.removeNetwork(networkId, IdentityIdMother.canonical()),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(() => unclaimed.removeNetwork(networkId, owner)).toThrow(
        NodeCanOnlyBeManagedByItsOwnerError,
      );
      expect(Object.keys(node.toPrimitives().networks)).toEqual([
        networkId.valueOf(),
      ]);
      expect(Object.keys(unclaimed.toPrimitives().networks)).toEqual([
        networkId.valueOf(),
      ]);
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

    it.each(IdentityIdMother.forged())(
      'should refuse claiming the node for an id with %s',
      (_case, forged: IdentityId) => {
        const before = node.toPrimitives();

        expect(() => node.assignOwner(forged, forged)).toThrow(
          InvalidNodeOwnerIdentityIdError,
        );
        expect(node.toPrimitives()).toEqual(before);
      },
    );

    it.each(IdentityIdMother.forged())(
      'should keep the owner when the current owner names an id with %s',
      (_case, forged: IdentityId) => {
        const owner = new IdentityMother().id;

        node.assignOwner(owner, owner);

        expect(() => node.assignOwner(forged, owner)).toThrow(
          InvalidNodeOwnerIdentityIdError,
        );
        expect(node.toPrimitives().owner).toBe(owner.valueOf());
      },
    );
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

      expect(() =>
        claimed.replaceLostOwner(new IdentityId(owner.valueOf())),
      ).toThrow(NodeIsAlreadyOwnedByThisIdentityError);
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

    it.each(IdentityIdMother.forged())(
      'should refuse a new owner id with %s and keep the node as it was',
      (_case, forged: IdentityId) => {
        const claimed = new NodeMother()
          .withOwner(new IdentityMother().id)
          .withRegistrationMode(NodeRegistrationMode.CLOSED)
          .build();
        const before = claimed.toPrimitives();

        expect(() => claimed.replaceLostOwner(forged)).toThrow(
          InvalidNodeOwnerIdentityIdError,
        );
        expect(claimed.toPrimitives()).toEqual(before);
      },
    );
  });

  describe('clearNonCanonicalOwner', () => {
    it.each(IdentityIdMother.forged())(
      'should leave the node unowned when its stored owner is %s',
      (_case, forged: IdentityId) => {
        const stored = Node.fromPrimitives({
          ...primitives,
          owner: forged.valueOf(),
        });

        expect(stored.clearNonCanonicalOwner()).toBe(true);
        expect(stored.hasOwner()).toBe(false);
        expect(stored.toPrimitives()).toEqual({
          ...primitives,
          owner: undefined,
          ownerResetRequired: true,
        });
      },
    );

    it('should keep a canonical owner', () => {
      const owner = generateIdentityId();
      const stored = Node.fromPrimitives({
        ...primitives,
        owner: owner.valueOf(),
      });
      const before = stored.toPrimitives();

      expect(stored.clearNonCanonicalOwner()).toBe(false);
      expect(stored.isOwnedBy(owner)).toBe(true);
      expect(stored.toPrimitives()).toEqual(before);
    });

    it('should leave an unowned node unchanged', () => {
      const unowned = Node.fromPrimitives({ ...primitives, owner: undefined });

      expect(unowned.clearNonCanonicalOwner()).toBe(false);
      expect(unowned.hasOwner()).toBe(false);
    });

    it('should refuse a claim by any identity once an alias owner was cleared', () => {
      const [, forged] = IdentityIdMother.forged()[0];
      const claimant = generateIdentityId();
      const stored = Node.fromPrimitives({
        ...primitives,
        owner: forged.valueOf(),
      });

      stored.clearNonCanonicalOwner();

      expect(() => stored.assignOwner(claimant, claimant)).toThrow(
        NodeOwnerResetIsRequiredError,
      );
      expect(stored.hasOwner()).toBe(false);
    });

    it('should keep refusing a claim after the node is reloaded', () => {
      const [, forged] = IdentityIdMother.forged()[0];
      const claimant = generateIdentityId();
      const stored = Node.fromPrimitives({
        ...primitives,
        owner: forged.valueOf(),
      });

      stored.clearNonCanonicalOwner();
      const reloaded = Node.fromPrimitives(stored.toPrimitives());

      expect(() => reloaded.assignOwner(claimant, claimant)).toThrow(
        NodeOwnerResetIsRequiredError,
      );
    });

    it('should lift the refusal when the reset installs the replacement owner', () => {
      const [, forged] = IdentityIdMother.forged()[0];
      const replacement = generateIdentityId();
      const stored = Node.fromPrimitives({
        ...primitives,
        owner: forged.valueOf(),
      });

      stored.clearNonCanonicalOwner();
      stored.replaceLostOwner(replacement);

      expect(stored.isOwnedBy(replacement)).toBe(true);
      expect(stored.toPrimitives().ownerResetRequired).toBe(false);
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

      node.updateRelayConfiguration(relayConfiguration, undefined);

      expect(node.toPrimitives().relayConfiguration).toEqual(
        relayConfiguration.toPrimitives(),
      );
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeRelayConfigurationWasUpdated),
      ]);
    });

    it('should let only the owner update the relay configuration once the node is claimed', () => {
      const owner = IdentityIdMother.canonical();
      const claimed = mother.withOwner(owner).build();
      const relayConfiguration = NodeRelayConfiguration.fromPrimitives({
        callsRelay: { port: 4199 },
      });

      expect(() =>
        claimed.updateRelayConfiguration(
          relayConfiguration,
          IdentityIdMother.canonical(),
        ),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(() =>
        claimed.updateRelayConfiguration(relayConfiguration, undefined),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(claimed.toPrimitives().relayConfiguration).toEqual(
        NodeRelayConfiguration.default().toPrimitives(),
      );

      claimed.updateRelayConfiguration(relayConfiguration, owner);

      expect(claimed.toPrimitives().relayConfiguration).toEqual(
        relayConfiguration.toPrimitives(),
      );
    });
  });

  describe('changeRegistrationMode', () => {
    let owner: IdentityId;

    beforeEach(() => {
      owner = IdentityIdMother.canonical();
      node = mother.withOwner(owner).build();
    });

    it('should be open for registration by default', () => {
      expect(node.isOpenForRegistration()).toBe(true);
      expect(node.isClosedForRegistration()).toBe(false);
      expect(node.toPrimitives().registrationMode).toBe('open');
    });

    it('should change the registration mode and record a domain event', () => {
      node.changeRegistrationMode(NodeRegistrationMode.CLOSED, owner);

      expect(node.isClosedForRegistration()).toBe(true);
      expect(node.isOpenForRegistration()).toBe(false);
      const events = node.pullDomainEvents();

      expect(events).toEqual([expect.any(NodeRegistrationModeWasChanged)]);
      expect(events[0].attributes).toEqual({ registrationMode: 'closed' });
    });

    it('should neither be open nor closed in codes mode', () => {
      node.changeRegistrationMode(NodeRegistrationMode.CODES, owner);

      expect(node.isOpenForRegistration()).toBe(false);
      expect(node.isClosedForRegistration()).toBe(false);
    });

    it('should not record an event when the mode does not change', () => {
      node.changeRegistrationMode(NodeRegistrationMode.OPEN, owner);

      expect(node.pullDomainEvents()).toEqual([]);
    });

    it('should let only the owner change the registration mode', () => {
      const unclaimed = new NodeMother().build();

      expect(() =>
        node.changeRegistrationMode(
          NodeRegistrationMode.CLOSED,
          IdentityIdMother.canonical(),
        ),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(() =>
        unclaimed.changeRegistrationMode(NodeRegistrationMode.CLOSED, owner),
      ).toThrow(NodeCanOnlyBeManagedByItsOwnerError);
      expect(node.isOpenForRegistration()).toBe(true);
      expect(unclaimed.isOpenForRegistration()).toBe(true);
      expect(node.pullDomainEvents()).toEqual([]);
    });
  });
});
