import MongoNodeMetadataMapper from '@app/contexts/nodes/infrastructure/mongo/mappers/MongoNodeMetadataMapper';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NetworkMother } from '../../../../mothers/NetworkMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('MongoNodeMetadataMapper', () => {
  let mapper: MongoNodeMetadataMapper;

  beforeEach(() => {
    mapper = new MongoNodeMetadataMapper();
  });

  it('should map a node to a mongo metadata document', () => {
    const owner = new IdentityMother().id;
    const network = new NetworkMother().withPrivateKey().build();
    const node = new NodeMother()
      .withNetwork(network.getId(), network)
      .withOwner(owner)
      .build();
    const primitives = node.toPrimitives();

    expect(mapper.toDocument(node)).toEqual({
      _id: 'local',
      networks: primitives.networks,
      nodeId: primitives.id,
      owner: owner.valueOf(),
    });
  });

  it('should generate a mongo metadata document with a node id', () => {
    const document = mapper.generate();

    expect(document._id).toBe('local');
    expect(document.networks).toEqual({});
    expect(document.nodeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(document.owner).toBeUndefined();
  });
});
