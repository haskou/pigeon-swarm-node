import schema from '@app/../docs/contracts/private-authorization/private-control-operation-v1.schema.json';

describe('private control operation schema', () => {
  it('publishes only the three closed version 1 operation shapes', () => {
    expect(schema.oneOf).toEqual([
      { $ref: '#/$defs/proposal' },
      { $ref: '#/$defs/commit' },
      { $ref: '#/$defs/revocation' },
    ]);
    expect(schema.$defs.envelope.additionalProperties).toBe(false);
    expect(schema.$defs.proposal.allOf[1].properties.payload.additionalProperties).toBe(false);
    expect(schema.$defs.commit.allOf[1].properties.payload.additionalProperties).toBe(false);
    expect(schema.$defs.revocation.allOf[1].properties.payload.additionalProperties).toBe(false);
  });
});
