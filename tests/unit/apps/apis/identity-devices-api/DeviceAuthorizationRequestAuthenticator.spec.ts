import { DeviceAuthorizationRequestAuthenticator } from '@app/apps/apis/identity-devices-api/DeviceAuthorizationRequestAuthenticator';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

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
    const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
      'GET',
      path,
      timestamp,
      undefined,
    );
    const headers: Record<string, string | undefined> = {
      'x-device-credential': new IdentityId(
        device.toPrimitives().publicKey,
      ).valueOf(),
      'x-device-signature': device.sign(JSON.stringify(payload)).valueOf(),
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
      RecoveryAuthority.fromString(
        recoveryAuthority.toPrimitives().publicKey,
      ),
    );
    source.headers['x-device-credential'] = undefined;
    source.headers['x-device-signature'] = undefined;
    const timestamp = source.headers['x-timestamp'] as string;
    const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
      source.request.method,
      source.request.path,
      timestamp,
      source.request.body,
    );
    source.headers['x-recovery-signature'] = recoveryAuthority
      .sign(JSON.stringify(payload))
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
});
