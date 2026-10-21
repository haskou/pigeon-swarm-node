import { DeviceAuthorizationTransitionLogViewModel } from '@app/apps/apis/identity-devices-api/view-model/DeviceAuthorizationTransitionLogViewModel';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationReplayResult } from '@app/contexts/identity-devices/domain/DeviceAuthorizationReplayResult';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DeviceAuthorizationTransitionPrimitives } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionPrimitives';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type KeyName =
  'author' | 'laptop' | 'recovered' | 'recoveryAuthority' | 'target';

type TransitionLogBody = {
  concurrentRecoveries: DeviceAuthorizationTransitionPrimitives[];
  identityId: string;
  recoveries: DeviceAuthorizationTransitionPrimitives[];
  transitions: DeviceAuthorizationTransitionPrimitives[];
};

type LocalCheckpoint = { epoch: string; revision: number };

type ReplayedBody = {
  log: DeviceAuthorizationTransitionLog;
  replay: DeviceAuthorizationReplayResult<DeviceAuthorizationTransitionPrimitives>;
  states: DeviceAuthorization[];
};

type Vectors = {
  identityId: string;
  keys: Record<KeyName, { privateKeyPem: string; publicKeyPem: string }>;
  logs: {
    head: { credentials: string[]; epoch: string; revision: number };
    name: string;
    stored: TransitionLogBody;
    verdicts: {
      local: LocalCheckpoint;
      name: string;
      reader: KeyName;
      removedBy: null | string;
      served: TransitionLogBody;
    }[];
  }[];
  networkIds: string[];
};

const vectors = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../../fixtures/device-authorization-transition-log-vectors.json',
    ),
    'utf8',
  ),
) as Vectors;

describe('Device authorization transition log vectors', () => {
  const policy = new DeviceAuthorizationPolicy();
  const genesis = DeviceAuthorization.genesis(
    new IdentityId(vectors.identityId),
    vectors.networkIds.map((networkId) => new NetworkId(networkId)),
    DeviceCredential.fromString(vectors.keys.author.publicKeyPem),
    RecoveryAuthority.fromString(vectors.keys.recoveryAuthority.publicKeyPem),
  );

  /**
   * What a client replays from a served body: the recovery lineage from the
   * genesis it derives itself, then the history from that base.
   */
  function replayOf(body: TransitionLogBody): ReplayedBody {
    const recoveries = body.recoveries.map((primitives) =>
      DeviceAuthorizationTransition.fromPrimitives(primitives),
    );
    const concurrentRecoveries = body.concurrentRecoveries.map((primitives) =>
      DeviceAuthorizationTransition.fromPrimitives(primitives),
    );
    const base = policy.replayRecoveryLineage(
      genesis,
      recoveries,
      concurrentRecoveries,
    ).authorization;
    const replay = policy.replay(
      base,
      body.transitions.map((payload) => ({
        encoding: JSON.stringify(payload),
        payload,
        transition: DeviceAuthorizationTransition.fromPrimitives(payload),
      })),
    );

    return {
      log: new DeviceAuthorizationTransitionLog(
        recoveries,
        concurrentRecoveries,
        replay.accepted.map(({ transition }) => transition),
        [base, ...replay.checkpoints],
      ),
      replay,
      states: [base, ...replay.checkpoints],
    };
  }

  /**
   * The client wipe rule of docs/design/device-authorization-transition-log.md:
   * only positive signed evidence above the local verified checkpoint removes
   * the reader.
   */
  function removalOf(
    served: TransitionLogBody,
    reader: DeviceCredential,
    local: LocalCheckpoint,
  ): null | string {
    let replayed: ReplayedBody;

    try {
      replayed = replayOf(served);
    } catch {
      return null;
    }

    if (replayed.replay.accepted.length !== served.transitions.length) {
      return null;
    }

    const recovery = served.recoveries.find(
      (entry) =>
        entry.epoch === local.epoch &&
        !DeviceCredential.fromString(entry.targetCredential).isEqual(reader),
    );

    if (recovery) {
      return recovery.operationId;
    }

    const { states } = replayed;
    const removed = states.findIndex(
      (state, index) =>
        index > 0 &&
        state.getRevision().valueOf() > local.revision &&
        states[index - 1].isAuthorized(reader) &&
        !state.isAuthorized(reader),
    );

    if (removed < 0) {
      return null;
    }

    const groupRevision = states[removed - 1].getRevision().valueOf();

    return (
      served.transitions.find(
        (entry) =>
          entry.previousRevision === groupRevision &&
          (entry.operation === 'recover' ||
            DeviceCredential.fromString(entry.targetCredential).isEqual(
              reader,
            )),
      )?.operationId ?? null
    );
  }

  it.each(vectors.logs)(
    'replays the stored log of $name to its head',
    ({ head, stored }) => {
      const { replay } = replayOf(stored);

      expect(
        replay.accepted.map(({ transition }) => transition.toPrimitives()),
      ).toEqual(stored.transitions);
      expect(
        replay.authorization
          .getCredentials()
          .map((credential) => credential.valueOf())
          .sort(),
      ).toEqual([...head.credentials].sort());
      expect(replay.authorization.getEpoch().valueOf()).toBe(head.epoch);
      expect(replay.authorization.getRevision().valueOf()).toBe(head.revision);
    },
  );

  it.each(vectors.logs)(
    'keeps the exact signed bytes of every entry of $name',
    ({ stored }) => {
      const entries = [
        ...stored.recoveries,
        ...stored.concurrentRecoveries,
        ...stored.transitions,
      ];

      for (const primitives of entries) {
        const transition =
          DeviceAuthorizationTransition.fromPrimitives(primitives);
        const signer = transition.isRecovery()
          ? RecoveryAuthority.fromString(
              vectors.keys.recoveryAuthority.publicKeyPem,
            )
          : transition.getAuthorCredential();

        expect(transition.toPrimitives()).toEqual(primitives);
        expect(
          signer.isValidSignature(
            transition.getSigningPayload(),
            transition.getSignature(),
          ),
        ).toBe(true);
      }
    },
  );

  it.each(vectors.logs.map(({ name, stored }) => ({ name, stored })))(
    'serves the whole stored log from the start where $name',
    ({ stored }) => {
      const disclosure = replayOf(stored)
        .log.disclose()
        .page(new DeviceAuthorizationRevision(0), 100);

      expect(
        new DeviceAuthorizationTransitionLogViewModel(disclosure).toResource(),
      ).toEqual({ ...stored, nextCursor: null });
    },
  );

  it.each(vectors.logs.flatMap(({ verdicts }) => verdicts))(
    'decides that $name',
    ({ local, reader, removedBy, served }) => {
      expect(
        removalOf(
          served,
          DeviceCredential.fromString(vectors.keys[reader].publicKeyPem),
          local,
        ),
      ).toBe(removedBy);
    },
  );
});
