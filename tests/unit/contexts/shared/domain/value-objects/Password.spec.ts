import { InvalidPasswordError } from '@app/contexts/shared/domain/errors/InvalidPasswordError';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';

describe('Password', () => {
  describe('constructor', () => {
    it('should create a valid password with the required complexity', () => {
      const validPassword = 'Valid-password!';

      const password = new Password(validPassword);

      expect(password.valueOf()).toBe(validPassword);
    });

    it('should create a valid password with exactly 12 characters', () => {
      const exactPassword = 'Valid-pass1!';

      const password = new Password(exactPassword);

      expect(password.valueOf()).toBe(exactPassword);
    });

    it('should throw InvalidPasswordError when password is shorter than 12 characters', () => {
      const shortPassword = 'Short-1';

      expect(() => new Password(shortPassword)).toThrow(InvalidPasswordError);
    });

    it('should throw InvalidPasswordError when password is longer than 256 characters', () => {
      const longPassword = `A${'a'.repeat(255)}!`;

      expect(() => new Password(longPassword)).toThrow(InvalidPasswordError);
    });

    it('should throw InvalidPasswordError when password has no uppercase letters', () => {
      expect(() => new Password('valid-password!')).toThrow(
        InvalidPasswordError,
      );
    });

    it('should throw InvalidPasswordError when password has no lowercase letters', () => {
      expect(() => new Password('VALID-PASSWORD!')).toThrow(
        InvalidPasswordError,
      );
    });

    it('should throw InvalidPasswordError when password has no symbols', () => {
      expect(() => new Password('Validpassword1')).toThrow(
        InvalidPasswordError,
      );
    });

    it('should throw InvalidPasswordError when password is empty', () => {
      expect(() => new Password('')).toThrow(InvalidPasswordError);
    });
  });
});
