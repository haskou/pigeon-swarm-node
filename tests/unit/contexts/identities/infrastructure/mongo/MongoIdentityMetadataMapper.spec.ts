import MongoIdentityMetadataMapper from '@app/contexts/identities/infrastructure/mongo/mappers/MongoIdentityMetadataMapper';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MongoIdentityMetadataMapper', () => {
  let mapper: MongoIdentityMetadataMapper;
  let mother: IdentityMother;

  beforeEach(() => {
    mapper = new MongoIdentityMetadataMapper();
    mother = new IdentityMother();
  });

  it('should map an identity and CID to a metadata document', () => {
    const identity = mother.build();
    const primitives = identity.toPrimitives();
    const cid = new IPFSId('bafyidentitycid');
    const receivedAt = new Timestamp(1773848829999);

    expect(mapper.toDocument(identity, cid, receivedAt)).toEqual({
      _id: `${primitives.id}:${cid.valueOf()}`,
      cid: cid.valueOf(),
      handle: primitives.profile.handle,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      receivedAt: receivedAt.valueOf(),
      version: primitives.version,
    });
  });
});
