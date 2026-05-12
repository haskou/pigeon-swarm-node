import { InvalidProfileHandleError } from '@app/contexts/identities/domain/errors/InvalidProfileHandleError';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';

describe('ProfileHandle', () => {
  it('should normalize valid handles to lowercase', () => {
    const handle = new ProfileHandle('Alice.Handle-01');

    expect(handle.valueOf()).toBe('alice.handle-01');
  });

  it('should reject handles with spaces', () => {
    expect(() => new ProfileHandle('alice handle')).toThrow(
      InvalidProfileHandleError,
    );
  });

  it('should reject handles with @', () => {
    expect(() => new ProfileHandle('@alice')).toThrow(
      InvalidProfileHandleError,
    );
  });

  it('should reject handles with unsupported symbols', () => {
    expect(() => new ProfileHandle('alice!')).toThrow(
      InvalidProfileHandleError,
    );
  });
});
