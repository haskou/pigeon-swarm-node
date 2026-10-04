import OrbitDBDeviceAuthorizationCanonicalizer from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationCanonicalizer';

describe(OrbitDBDeviceAuthorizationCanonicalizer.name, () => {
  const canonicalizer = new OrbitDBDeviceAuthorizationCanonicalizer();

  it('serializes equivalent objects identically regardless of key order', () => {
    expect(canonicalizer.serialize({ a: { c: 3, d: 2 }, b: 1 })).toBe(
      canonicalizer.serialize({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(canonicalizer.serialize({ a: { c: 3, d: 2 }, b: 1 })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it('keeps array order and normalizes nested objects inside arrays', () => {
    expect(canonicalizer.serialize([{ a: 2, b: 1 }, { a: 1 }])).toBe(
      '[{"a":2,"b":1},{"a":1}]',
    );
  });

  it('returns primitives and null untouched', () => {
    expect(canonicalizer.normalize('value')).toBe('value');
    expect(canonicalizer.normalize(null)).toBeNull();
    expect(canonicalizer.normalize(7)).toBe(7);
  });
});
