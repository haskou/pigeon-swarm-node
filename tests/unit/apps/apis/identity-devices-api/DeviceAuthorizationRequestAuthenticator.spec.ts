import { DeviceAuthorizationRequestAuthenticator } from '@app/apps/apis/identity-devices-api/DeviceAuthorizationRequestAuthenticator';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { SignatureMother } from '../../../mothers/SignatureMother';

describe(DeviceAuthorizationRequestAuthenticator.name, () => {
  async function fixture(deviceInput?: KeyPair) {
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
    const timestamp = String(Date.now());
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
    async function recoveryReader() {
      const recoveryAuthority = await KeyPair.generate();
      const source = await fixture();
      const authorization = DeviceAuthorization.genesis(
        source.authorization.getIdentityId(),
        source.authorization.getNetworkIds(),
        source.authorization.getCredentials()[0],
        RecoveryAuthority.fromString(
          recoveryAuthority.toPrimitives().publicKey,
        ),
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

    it('identifies a signing device the head no longer authorizes', async () => {
      const removed = await KeyPair.generate();
      const authorized = await fixture();
      const reader = await fixture(removed);

      const credential =
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          reader.request,
          authorized.authorization,
        );

      expect(credential).toBeInstanceOf(DeviceCredential);
      expect(
        (credential as DeviceCredential).isEqual(
          DeviceCredential.fromString(removed.toPrimitives().publicKey),
        ),
      ).toBe(true);
    });

    it('identifies the recovery authority of the identity', async () => {
      const { authorization, request } = await recoveryReader();

      const reader =
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          authorization,
        );

      expect(reader).toBeInstanceOf(RecoveryAuthority);
      expect(
        (reader as RecoveryAuthority).isEqual(
          authorization.getRecoveryAuthority(),
        ),
      ).toBe(true);
    });

    it('rejects a recovery signature from another authority', async () => {
      const { request } = await recoveryReader();
      const other = await fixture();

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          other.authorization,
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects a device signature that does not cover the request', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-timestamp'] = String(Date.now() + 1);

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          authorization,
        ),
      ).toThrow('Invalid signed request.');
    });

    it('rejects a request carrying both proofs', async () => {
      const { authorization, headers, request } = await fixture();
      headers['x-recovery-signature'] = headers['x-device-signature'];

      expect(() =>
        new DeviceAuthorizationRequestAuthenticator().authenticateReader(
          request,
          authorization,
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
          authorization,
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
          authorization,
        ),
      ).toThrow('Invalid signed request.');
    });
  });
});
