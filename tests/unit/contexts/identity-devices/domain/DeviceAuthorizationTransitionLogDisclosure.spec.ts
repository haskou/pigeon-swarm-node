import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

describe('DeviceAuthorizationTransitionLog public disclosure', () => {
  const credentialOf = (key: KeyPair): DeviceCredential =>
    DeviceCredential.fromString(key.toPrimitives().publicKey);
  let identityId: IdentityId;
  let owner: KeyPair;
  let log: DeviceAuthorizationTransitionLog;
  let transitions: DeviceAuthorizationTransition[];

  const enrollment = (
    previousRevision: number,
    target: KeyPair,
  ): DeviceAuthorizationTransition => {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      new DeviceAuthorizationRevision(previousRevision),
      credentialOf(owner),
      credentialOf(target),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Timestamp.now().valueOf() + 60_000),
        Timestamp.now(),
      ),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(owner.sign(proven.getSigningPayload()));
  };

  beforeEach(async () => {
    owner = await KeyPair.generate();
    identityId = new IdentityId((await KeyPair.generate()).toPrimitives().publicKey);
    const genesis = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      credentialOf(owner),
      RecoveryAuthority.fromString((await KeyPair.generate()).toPrimitives().publicKey),
    );
    transitions = [
      enrollment(0, await KeyPair.generate()),
      enrollment(1, await KeyPair.generate()),
      enrollment(2, await KeyPair.generate()),
    ];
    log = new DeviceAuthorizationTransitionLog([], [], transitions, [genesis]);
  });

  it('discloses the whole signed log, with no reader to ask', () => {
    const disclosure = log.disclose();

    expect(disclosure.getIdentityId().isEqual(identityId)).toBe(true);
    expect(disclosure.getTransitions()).toEqual(transitions);
    expect(disclosure.getNextCursor()).toBeUndefined();
  });

  it('cuts a page at the limit and names the cursor for the next one', () => {
    const first = log.disclose().page(DeviceAuthorizationRevision.initial(), 2);
    const second = log.disclose().page(first.getNextCursor() as DeviceAuthorizationRevision, 2);

    expect(first.getTransitions()).toEqual(transitions.slice(0, 2));
    expect(first.getNextCursor()?.valueOf()).toBe(2);
    expect(second.getTransitions()).toEqual(transitions.slice(2));
    expect(second.getNextCursor()).toBeUndefined();
  });

  it('serves nothing and no cursor past the end of the log', () => {
    const page = log.disclose().page(new DeviceAuthorizationRevision(3), 10);

    expect(page.getTransitions()).toEqual([]);
    expect(page.getNextCursor()).toBeUndefined();
  });
});
