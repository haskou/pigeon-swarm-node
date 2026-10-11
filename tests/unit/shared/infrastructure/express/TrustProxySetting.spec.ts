import { parseTrustProxySetting } from '@app/shared/infrastructure/express/TrustProxySetting';

describe('parseTrustProxySetting', () => {
  it('ignores forwarded headers by default', () => {
    expect(parseTrustProxySetting('false')).toBe(false);
    expect(parseTrustProxySetting('')).toBe(false);
  });

  it('accepts loopback and a positive hop count', () => {
    expect(parseTrustProxySetting('loopback')).toBe('loopback');
    expect(parseTrustProxySetting('2')).toBe(2);
  });

  it('rejects true and anything else, so a bad value fails at boot', () => {
    expect(() => parseTrustProxySetting('true')).toThrow();
    expect(() => parseTrustProxySetting('0')).toThrow();
    expect(() => parseTrustProxySetting('203.0.113.0/24')).toThrow();
  });
});
