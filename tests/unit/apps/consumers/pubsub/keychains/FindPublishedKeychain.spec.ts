import { findPublishedKeychain } from '@app/apps/consumers/pubsub/keychains/FindPublishedKeychain';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('findPublishedKeychain', () => {
  let finder: MockProxy<CurrentKeychainFinder>;
  let event: KeychainWasPublishedEvent;

  beforeEach(() => {
    finder = mock<CurrentKeychainFinder>();
    event = new KeychainWasPublishedEvent(new IdentityMother().id.valueOf());
  });

  it('should complete when the published keychain is not resolvable yet', async () => {
    finder.find.mockRejectedValue(
      new KeychainNotFoundError(new IdentityMother().id),
    );

    await expect(findPublishedKeychain(finder, event)).resolves.toBeUndefined();
  });

  it('should complete without retrying while the replicated state is not open', async () => {
    finder.find.mockRejectedValue(new ReplicatedStateNotReadyError());

    await expect(findPublishedKeychain(finder, event)).resolves.toBeUndefined();
    expect(finder.find).toHaveBeenCalledTimes(1);
  });

  it('should complete without retrying when the keychain cannot be verified yet', async () => {
    finder.find.mockRejectedValue(
      new KeychainOwnershipUnverifiedError(new Error('document not found')),
    );

    await expect(findPublishedKeychain(finder, event)).resolves.toBeUndefined();
    expect(finder.find).toHaveBeenCalledTimes(1);
  });

  it('should rethrow lookup failures other than a missing keychain', async () => {
    const failure = new Error('lookup failed');
    finder.find.mockRejectedValue(failure);

    await expect(findPublishedKeychain(finder, event)).rejects.toBe(failure);
  });
});
