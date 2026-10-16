import { InvalidCallScopeError } from '@app/contexts/calls/domain/errors/InvalidCallScopeError';
import { CallCapabilityHash } from '@app/contexts/calls/domain/value-objects/CallCapabilityHash';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { cryptoVectors } from '../../../../support/cryptoVectors';

interface CommitmentVectors {
  call: {
    invalid: { args: [string, string]; name: string }[];
    valid: { args: [string, string]; id: string; name: string }[];
  };
}

interface BearerVectors {
  verify: { expected: boolean; hash: string; name: string; token: string }[];
}

const { call } = cryptoVectors<CommitmentVectors>('commitment-ids');
const { verify } = cryptoVectors<BearerVectors>('bearer-capabilities');
const COMMITMENT = /^[0-9a-f]{64}$/;

describe('Call commitment vectors', () => {
  it.each(call.valid)(
    'derives the call id of $name',
    ({ args: [creator, nonce], id }) => {
      expect(
        CallId.fromStart(
          new IdentityId(creator),
          new CallNonce(nonce),
        ).valueOf(),
      ).toBe(id);
    },
  );

  it.each(call.invalid)(
    'rejects a call start with $name',
    ({ args: [creator, nonce] }) => {
      expect(() =>
        CallId.fromStart(new IdentityId(creator), new CallNonce(nonce)),
      ).toThrow();
    },
  );

  it.each(verify.filter(({ hash }) => COMMITMENT.test(hash)))(
    'matches the group capability of $name only when expected',
    ({ expected, hash, token }) => {
      expect(new CallCapabilityHash(hash).matches(token)).toBe(expected);
    },
  );

  it.each(verify.filter(({ hash }) => !COMMITMENT.test(hash)))(
    'refuses to store a $name',
    ({ hash }) => {
      expect(() => new CallCapabilityHash(hash)).toThrow(InvalidCallScopeError);
    },
  );
});
