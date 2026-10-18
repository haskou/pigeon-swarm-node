import { DeviceAuthorizationRequestAuthenticator } from '@app/apps/apis/identity-devices-api/DeviceAuthorizationRequestAuthenticator';
import { signedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { SignatureMother } from '../../../mothers/SignatureMother';

describe(DeviceAuthorizationRequestAuthenticator.name, () => {
  const STALE = SignedHttpRequestSignature.REPLAY_WINDOW_MS;
  const ENTRY_POINTS = [
    'authenticate',
    'authenticateReader',
    'authenticateCurrentDevice',
  ] as const;
  const RECOVERY_ENTRY_POINTS = ['authenticate', 'authenticateReader'] as const;
  const AUTHORIZED_ENTRY_POINTS = [
    'authenticate',
    'authenticateCurrentDevice',
  ] as const;

  const logOf = (
    ...states: DeviceAuthorization[]
  ): DeviceAuthorizationTransitionLog =>
    new DeviceAuthorizationTransitionLog([], [], [], states);

  function authenticateBy(
    entryPoint: (typeof ENTRY_POINTS)[number],
    request: Request,
    authorization: DeviceAuthorization,
  ): void {
    const authenticator = new DeviceAuthorizationRequestAuthenticator();

    if (entryPoint === 'authenticateReader') {
      authenticator.authenticateReader(request, logOf(authorization));

      return;
    }

    authenticator[entryPoint](request, authorization);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function fixture(deviceInput?: KeyPair, signedAt = Date.now()) {
    const device = deviceInput ?? (await KeyPair.generate());
    const identity = await KeyPair.generate();
    const identityId = new IdentityId(identity.toPrimitives().publicKey);
    const authorization = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(device.toPrimitives().publicKey),
      RecoveryAuthority.fromString(
        (await KeyPair.generate()).toPrimitives().publicKey,
      ),
    );
    const timestamp = String(signedAt);
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}`;
    const payload = SignedHttpRequestSignature.signingContent({
      body: undefined,
      method: 'GET',
      path,
      timestamp: Number(timestamp),
    });
    const headers: Record<string, string | undefined> = {
      'x-device-credential': new IdentityId(
        device.toPrimitives().publicKey,
      ).valueOf(),
      'x-device-signature': device.sign(payload).valueOf(),
      'x-timestamp': timestamp,
    };
    const request = {
      body: undefined,
      header: (name: string) => headers[name.toLowerCase()],
      method: 'GET',
      path,
    } as Request;

    return { authorization, headers, request };
  }

  async function recoveryProof(signedAt = Date.now()) {
    const recoveryAuthority = await KeyPair.generate();
    const source = await fixture(undefined, signedAt);
    const authorization = DeviceAuthorization.genesis(
      source.authorization.getIdentityId(),
      source.authorization.getNetworkIds(),
      source.authorization.getCredentials()[0],
      RecoveryAuthority.fromString(recoveryAuthority.toPrimitives().publicKey),
    );
    const payload = SignedHttpRequestSignature.signingContent({
      body: source.request.body,
      method: source.request.method,
      path: source.request.path,
      timestamp: Number(source.headers['x-timestamp'] as string),
    });
    source.headers['x-device-credential'] = undefined;
    source.headers['x-device-signature'] = undefined;
    source.headers['x-recovery-signature'] = recoveryAuthority
      .sign(payload)
      .valueOf();

    return { ...source, authorization };
  }

  it.each(ENTRY_POINTS)(
    'refuses a replayed device proof to %s',
    async (entryPoint) => {
      const { authorization, request } = await fixture();
      authenticateBy(entryPoint, request, authorization);

      expect(() => authenticateBy(entryPoint, request, authorization)).toThrow(
        'Invalid signed request.',
      );
    },
  );

  it.each(ENTRY_POINTS)(
    'refuses a stale device proof to %s',
    async (entryPoint) => {
      const { authorization, request } = await fixture(
        undefined,
        Date.now() - STALE,
      );

      expect(() => authenticateBy(entryPoint, request, authorization)).toThrow(
        'Invalid signed request.',
      );
    },
  );

  it.each(RECOVERY_ENTRY_POINTS)(
    'refuses a replayed recovery proof to %s',
    async (entryPoint) => {
      const { authorization, request } = await recoveryProof();
      authenticateBy(entryPoint, request, authorization);

      expect(() => authenticateBy(entryPoint, request, authorization)).toThrow(
        'Invalid signed request.',
      );
    },
  );

  it.each(RECOVERY_ENTRY_POINTS)(
    'refuses a stale recovery proof to %s',
    async (entryPoint) => {
      const { authorization, request } = await recoveryProof(
        Date.now() - STALE,
      );

      expect(() => authenticateBy(entryPoint, request, authorization)).toThrow(
        'Invalid signed request.',
      );
    },
  );

  it.each(IdentityIdMother.aliases())(
    'refuses a reader proof that names its key by %s and takes no replay slot',
    async (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const { authorization, headers, request } = await fixture();
      const log = logOf(authorization);
      headers['x-device-credential'] = aliasOf(
        new IdentityId(String(headers['x-device-credential'])),
      ).valueOf();
      const accept = jest.spyOn(signedRequestReplayGuard, 'accept');

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          log,
        ),
      ).toThrow('Invalid signed request.');
      expect(accept).not.toHaveBeenCalled();
    },
  );

  it.each(IdentityIdMother.aliases())(
    'refuses a device proof that names an authorized key by %s',
    async (_encoding, aliasOf: (of: IdentityId) => IdentityId) => {
      const { authorization, headers, request } = await fixture();
      headers['x-device-credential'] = aliasOf(
        new IdentityId(String(headers['x-device-credential'])),
      ).valueOf();

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticate(
          request,
          authorization,
        ),
      ).toThrow('Invalid signed request.');
    },
  );

  it.each(AUTHORIZED_ENTRY_POINTS)(
    'takes no replay slot for a device proof %s refuses',
    async (entryPoint) => {
      const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
      const { authorization } = await fixture();
      const stranger = await fixture();

      expect(() =>
        authenticateBy(entryPoint, stranger.request, authorization),
      ).toThrow('Invalid signed request.');
      expect(accept).not.toHaveBeenCalled();
    },
  );

  it.each(AUTHORIZED_ENTRY_POINTS)(
    'admits a proof to %s after a refusal against an authorization lacking its device',
    async (entryPoint) => {
      const device = await KeyPair.generate();
      const authorized = await fixture(device);
      const { request } = await fixture(device);
      const other = await fixture();

      expect(() =>
        authenticateBy(entryPoint, request, other.authorization),
      ).toThrow('Invalid signed request.');

      expect(() =>
        authenticateBy(entryPoint, request, authorized.authorization),
      ).not.toThrow();
    },
  );

  it('rejects requests without a current-device or recovery proof', async () => {
    const { authorization, headers, request } = await fixture();
    headers['x-device-credential'] = undefined;
    headers['x-device-signature'] = undefined;

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        request,
        authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  it('accepts proof from the current recovery authority', async () => {
    const recoveryAuthority = await KeyPair.generate();
    const source = await fixture();
    const authorization = DeviceAuthorization.genesis(
      source.authorization.getIdentityId(),
      source.authorization.getNetworkIds(),
      DeviceCredential.fromString(
        (await KeyPair.generate()).toPrimitives().publicKey,
      ),
      RecoveryAuthority.fromString(recoveryAuthority.toPrimitives().publicKey),
    );
    source.headers['x-device-credential'] = undefined;
    source.headers['x-device-signature'] = undefined;
    const timestamp = source.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: source.request.body,
      method: source.request.method,
      path: source.request.path,
      timestamp: Number(timestamp),
    });
    source.headers['x-recovery-signature'] = recoveryAuthority
      .sign(payload)
      .valueOf();

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        source.request,
        authorization,
      ),
    ).not.toThrow();
  });

  it('accepts proof from an authorized credential', async () => {
    const { authorization, request } = await fixture();

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        request,
        authorization,
      ),
    ).not.toThrow();
  });

  it('rejects proof from a credential outside the authorization set', async () => {
    const authorized = await fixture();
    const attacker = await fixture();

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        attacker.request,
        authorized.authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  it('rejects a device credential without its paired signature', async () => {
    const { authorization, headers, request } = await fixture();
    headers['x-device-signature'] = undefined;

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        request,
        authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  it('rejects empty device proof headers as malformed', async () => {
    const { authorization, headers, request } = await fixture();
    headers['x-device-credential'] = '';
    headers['x-device-signature'] = '';

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        request,
        authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  it('rejects a signature that does not cover the canonical request', async () => {
    const { authorization, headers, request } = await fixture();
    headers['x-timestamp'] = String(Date.now() + 1);

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticate(
        request,
        authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  it('rejects a device signature re-encoded without changing its bytes', async () => {
    const { authorization, headers, request } = await fixture();
    headers['x-device-signature'] = SignatureMother.reencoded(
      String(headers['x-device-signature']),
    );

    expect(() =>
      new DeviceAuthorizationRequestAuthenticator().authenticateCurrentDevice(
        request,
        authorization,
      ),
    ).toThrow('Invalid signed request.');
  });

  describe('authenticateReader', () => {
    async function removedReader() {
      const removed = await KeyPair.generate();
      const authorized = await fixture();
      const reader = await fixture(removed);
      const removedCredential = DeviceCredential.fromString(
        removed.toPrimitives().publicKey,
      );
      const enrolled = authorized.authorization.enroll(removedCredential);

      return {
        ...reader,
        log: logOf(
          authorized.authorization,
          enrolled,
          enrolled.revoke(removedCredential),
        ),
        removed,
      };
    }

    it('identifies a signing device the head no longer authorizes', async () => {
      const { log, removed, request } = await removedReader();

      const credential =
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          log,
        );

      expect(credential).toBeInstanceOf(DeviceCredential);
      expect(
        (credential as DeviceCredential).isEqual(
          DeviceCredential.fromString(removed.toPrimitives().publicKey),
        ),
      ).toBe(true);
    });

    it('refuses a replayed proof of a device the head no longer authorizes', async () => {
      const { log, request } = await removedReader();
      new DeviceAuthorizationRequestAuthenticator().authenticateReader(
        request,
        log,
      );

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          log,
        ),
      ).toThrow('Invalid signed request.');
    });

    it('serves a device in no replayed state without taking a replay slot', async () => {
      const accept = jest.spyOn(signedRequestReplayGuard, 'accept');
      const { authorization } = await fixture();
      const stranger = await KeyPair.generate();
      const { request } = await fixture(stranger);

      const readers = [1, 2].map(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      );

      readers.forEach((reader) =>
        expect(
          (reader as DeviceCredential).isEqual(
            DeviceCredential.fromString(stranger.toPrimitives().publicKey),
          ),
        ).toBe(true),
      );
      expect(accept).not.toHaveBeenCalled();
    });

    it('refuses a stale proof of a device in no replayed state', async () => {
      const { authorization } = await fixture();
      const { request } = await fixture(undefined, Date.now() - STALE);

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      ).toThrow('Invalid signed request.');
    });

    it('identifies the recovery authority of the identity', async () => {
      const { authorization, request } = await recoveryProof();

      const reader =
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        );

      expect(reader).toBeInstanceOf(RecoveryAuthority);
      expect(
        (reader as RecoveryAuthority).isEqual(
          authorization.getRecoveryAuthority(),
        ),
      ).toBe(true);
    });

    it('rejects a recovery signature from another authority', async () => {
      const { request } = await recoveryProof();
      const other = await fixture();

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(other.authorization),
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects a device signature that does not cover the request', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-timestamp'] = String(Date.now() + 1);

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects a request carrying both proofs', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-recovery-signature'] = headers['x-device-signature'];

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects a request without any proof', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-device-credential'] = undefined;
      headers['x-device-signature'] = undefined;

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects empty device proof headers', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-device-credential'] = '';
      headers['x-device-signature'] = '';

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          logOf(authorization),
        ),
      ).toThrow('Invalid signed request.');
    });
  });
});
