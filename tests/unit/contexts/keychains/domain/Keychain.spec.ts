import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { InvalidKeychainVersionError } from '@app/contexts/keychains/domain/errors/InvalidKeychainVersionError';

import { KeychainMother } from '../../../mothers/KeychainMother';

describe('Keychain', () => {
  it('should restore from primitives', async () => {
    const mother = await KeychainMother.create();

    const keychain = Keychain.fromPrimitives(mother.primitives());

    expect(keychain.toPrimitives()).toEqual(mother.primitives());
  });

  it('should record a domain event when published', async () => {
    const mother = await KeychainMother.create();

    const keychain = Keychain.publish(mother.primitives());

    expect(keychain.pullDomainEvents()).toEqual([
      expect.any(KeychainWasPublishedEvent),
    ]);
  });

  it('should reject non-positive versions', async () => {
    const mother = await KeychainMother.create();

    expect(() =>
      Keychain.fromPrimitives({ ...mother.primitives(), version: 0 }),
    ).toThrow(InvalidKeychainVersionError);
  });
});
