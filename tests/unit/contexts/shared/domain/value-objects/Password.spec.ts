import { InvalidPasswordError } from '@app/contexts/shared/domain/errors/InvalidPasswordError';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { faker } from '@faker-js/faker';

describe('Password', () => {
  describe('constructor', () => {
    it('should create a valid password with 8 or more characters', () => {
      const validPassword = faker.internet.password({ length: 12 });

      const password = new Password(validPassword);

      expect(password.valueOf()).toBe(validPassword);
    });

    it('should create a valid password with exactly 8 characters', () => {
      const exactPassword = faker.string.alphanumeric(8);

      const password = new Password(exactPassword);

      expect(password.valueOf()).toBe(exactPassword);
    });

    it('should throw InvalidPasswordError when password is shorter than 8 characters', () => {
      const shortPassword = faker.string.alphanumeric(7);

      expect(() => new Password(shortPassword)).toThrow(InvalidPasswordError);
    });

    it('should throw InvalidPasswordError when password is empty', () => {
      expect(() => new Password('')).toThrow(InvalidPasswordError);
    });
  });
});
