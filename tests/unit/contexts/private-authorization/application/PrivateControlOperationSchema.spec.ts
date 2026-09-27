import schema from '@app/../docs/contracts/private-authorization/private-control-operation-v1.schema.json';
import { Buffer } from 'buffer';

describe('private control operation schema', () => {
  it.each([
    ['base64url16', 16],
    ['base64url32', 32],
    ['base64url64', 64],
  ] as const)('publishes canonical %s encodings', (definition, bytes) => {
    const pattern = new RegExp(schema.$defs[definition].pattern);
    const canonical = Buffer.alloc(bytes, 255).toString('base64url');
    const nonCanonical = `${canonical.slice(0, -1)}B`;

    expect(pattern.test(canonical)).toBe(true);
    expect(pattern.test(nonCanonical)).toBe(false);
  });

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

  it('publishes the runtime authorization revision range', () => {
    expect(schema.$defs.envelope.properties.authorizationRevision).toEqual({
      maximum: Number.MAX_SAFE_INTEGER,
      minimum: 0,
      type: 'integer',
    });
  });
});
