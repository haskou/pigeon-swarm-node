import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationCheckpointCandidate } from '@app/contexts/identity-devices/domain/DeviceAuthorizationCheckpointCandidate';
import { DeviceAuthorizationOverflowBound } from '@app/contexts/identity-devices/domain/DeviceAuthorizationOverflowBound';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

describe(DeviceAuthorizationPolicy.name, () => {
  const policy = new DeviceAuthorizationPolicy();
  const now = new Timestamp(1_800_000_000_000);
  let identityId: IdentityId;
  let owner: DeviceCredential;
  let candidate: DeviceCredential;
  let recoveryAuthority: RecoveryAuthority;

  beforeAll(async () => {
    const [identity, ownerKeys, candidateKeys, recoveryKeys] =
      await Promise.all([
        KeyPair.generate(),
        KeyPair.generate(),
        KeyPair.generate(),
        KeyPair.generate(),
      ]);

    identityId = new IdentityId(identity.toPrimitives().publicKey);
    owner = DeviceCredential.fromString(ownerKeys.toPrimitives().publicKey);
    candidate = DeviceCredential.fromString(
      candidateKeys.toPrimitives().publicKey,
    );
    recoveryAuthority = RecoveryAuthority.fromString(
      recoveryKeys.toPrimitives().publicKey,
    );
  });

  function enrollment(
    operationId = DeviceAuthorizationOperationId.generate(),
    pairingId = PairingId.generate(),
  ): DeviceAuthorizationTransition {
    return DeviceAuthorizationTransition.enrollment(
      identityId,
      operationId,
      DeviceAuthorizationRevision.initial(),
      owner,
      candidate,
      new PairingAuthorization(
        pairingId,
        new PairingExpiration(now.valueOf() + 60_000),
        now,
      ),
    );
  }

  function recovery(
    operationId = DeviceAuthorizationOperationId.generate(),
  ): DeviceAuthorizationTransition {
    return DeviceAuthorizationTransition.recovery(
      identityId,
      operationId,
      DeviceAuthorizationRevision.initial(),
      candidate,
    );
  }

  function checkpoint(
    name: string,
    revision: number,
    lineage: string,
  ): DeviceAuthorizationCheckpointCandidate<string> {
    return {
      encoding: name,
      payload: name,
      revision: new DeviceAuthorizationRevision(revision),
      sharesLineageWith: (other) => other.payload.endsWith(lineage),
    };
  }

  describe('replay rejection', () => {
    it('rejects a transition recording an already recorded operation', () => {
      const operationId = DeviceAuthorizationOperationId.generate();

      expect(() =>
        policy.verifyNotReplayed(enrollment(operationId), [
          recovery(),
          recovery(new DeviceAuthorizationOperationId(operationId.valueOf())),
        ]),
      ).toThrow(InvalidDeviceAuthorizationTransitionError);
    });

    it('rejects an enrollment redeeming an already redeemed pairing', () => {
      const pairingId = PairingId.generate();

      expect(() =>
        policy.verifyNotReplayed(enrollment(undefined, pairingId), [
          enrollment(undefined, new PairingId(pairingId.valueOf())),
        ]),
      ).toThrow(InvalidDeviceAuthorizationTransitionError);
    });

    it('accepts a transition with a fresh operation and pairing', () => {
      expect(() =>
        policy.verifyNotReplayed(enrollment(), [enrollment(), recovery()]),
      ).not.toThrow();
    });

    it('never treats transitions without pairings as the same pairing', () => {
      expect(recovery().replays(recovery())).toBe(false);
      expect(enrollment().replays(recovery())).toBe(false);
    });
  });

  describe('checkpoint precedence', () => {
    it('has no preferred checkpoint without candidates', () => {
      expect(policy.preferCheckpoint([])).toBeUndefined();
    });

    it('prefers the highest revision, then the lowest canonical form', () => {
      const precedence = policy.preferCheckpoint([
        checkpoint('b:x', 2, ':x'),
        checkpoint('z:x', 1, ':x'),
        checkpoint('a:x', 2, ':x'),
      ]);

      expect(precedence?.preferred).toBe('a:x');
    });

    it('lists the contenders at the preferred revision on its lineage, preferred first', () => {
      const precedence = policy.preferCheckpoint([
        checkpoint('d:x', 2, ':x'),
        checkpoint('c:y', 2, ':y'),
        checkpoint('e:x', 1, ':x'),
        checkpoint('b:x', 2, ':x'),
      ]);

      expect(precedence).toEqual({
        contenders: ['b:x', 'd:x'],
        preferred: 'b:x',
      });
    });
  });

  describe('frontier precedence', () => {
    it('prefers the source reaching the highest revision, then the lowest canonical form', () => {
      expect(
        policy.preferFrontier([
          {
            encoding: 'b',
            payload: 'b',
            revision: new DeviceAuthorizationRevision(3),
          },
          {
            encoding: 'c',
            payload: 'c',
            revision: new DeviceAuthorizationRevision(2),
          },
          {
            encoding: 'a',
            payload: 'a',
            revision: new DeviceAuthorizationRevision(3),
          },
        ]),
      ).toBe('a');
    });

    it('has no frontier without sources', () => {
      expect(() => policy.preferFrontier([])).toThrow(
        InvalidDeviceAuthorizationTransitionError,
      );
    });
  });

  describe('overflow', () => {
    function bound(
      limit: number,
      historyFits: boolean,
    ): DeviceAuthorizationOverflowBound<number> {
      return {
        fitsProjection: (sources) =>
          sources.length <= (historyFits ? limit : 0),
        fitsReplayedHistory: () => historyFits,
        fitsSources: (sources) => sources.length <= limit,
      };
    }

    it('witnesses an overflow with the shortest prefix exceeding the bound', () => {
      expect(
        policy.minimalOverflowWitness([1, 2, 3, 4], bound(2, true)),
      ).toEqual([1, 2, 3]);
    });

    it('measures the witness by its projection when the replayed history overflows', () => {
      expect(policy.minimalOverflowWitness([1, 2, 3], bound(2, false))).toEqual(
        [1],
      );
    });

    it('rejects building a witness for sources within the bound', () => {
      expect(() =>
        policy.minimalOverflowWitness([1, 2], bound(2, true)),
      ).toThrow(InvalidDeviceAuthorizationTransitionError);
    });

    it('admits only a minimal witness exceeding the bound', () => {
      expect(policy.isMinimalOverflowWitness([1, 2, 3], bound(2, true))).toBe(
        true,
      );
      expect(policy.isMinimalOverflowWitness([1], bound(2, false))).toBe(true);
      expect(policy.isMinimalOverflowWitness([], bound(2, true))).toBe(false);
      expect(policy.isMinimalOverflowWitness([1, 2], bound(2, true))).toBe(
        false,
      );
      expect(
        policy.isMinimalOverflowWitness([1, 2, 3, 4], bound(2, true)),
      ).toBe(false);
    });

    it('suspends the replayed authorization past the latest known revision', () => {
      const replayed = DeviceAuthorization.genesis(
        identityId,
        [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
        owner,
        recoveryAuthority,
      );

      const suspended = policy.suspendAtOverflow(
        replayed,
        new DeviceAuthorizationRevision(4),
      );

      expect(suspended.getRevision().valueOf()).toBe(5);
      expect(suspended.getCredentials()).toEqual([]);
      expect(
        policy
          .suspendAtOverflow(replayed, DeviceAuthorizationRevision.initial())
          .getRevision()
          .valueOf(),
      ).toBe(1);
    });
  });
});
