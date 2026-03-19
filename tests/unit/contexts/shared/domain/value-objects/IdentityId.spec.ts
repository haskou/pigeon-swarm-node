import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StringValueObject } from '@haskou/value-objects';

const rawKey = 'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';
const pemKey = `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----\n`;

describe('IdentityId', () => {
  describe('constructor', () => {
    it('should create an IdentityId from a raw key string without PEM headers', () => {
      const identityId = new IdentityId(rawKey);

      expect(identityId.valueOf()).toBe(rawKey);
    });

    it('should create an IdentityId from a key string with PEM headers', () => {
      const identityId = new IdentityId(pemKey);

      expect(identityId.valueOf()).toBe(rawKey);
    });

    it('should create an IdentityId from a StringValueObject', () => {
      const stringValue = new StringValueObject(rawKey);

      const identityId = new IdentityId(stringValue);

      expect(identityId.valueOf()).toBe(rawKey);
    });

    it('should throw when the value is not a valid public key', () => {
      expect(() => new IdentityId('not-a-valid-key')).toThrow();
    });
  });

  describe('valueOf', () => {
    it('should return the key without PEM headers', () => {
      const identityId = new IdentityId(rawKey);

      expect(identityId.valueOf()).toBe(rawKey);
    });

    it('should return the same raw value regardless of whether headers were provided', () => {
      const fromRaw = new IdentityId(rawKey);
      const fromPem = new IdentityId(pemKey);

      expect(fromRaw.valueOf()).toBe(fromPem.valueOf());
    });
  });
});
