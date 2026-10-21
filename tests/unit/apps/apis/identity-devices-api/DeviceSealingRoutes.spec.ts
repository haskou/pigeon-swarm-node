import DeviceAuthorizationTransitionReadRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionReadRateLimiter';
import DeviceSealingViewRateLimiter from '@app/apps/apis/identity-devices-api/DeviceSealingViewRateLimiter';
import { GetDeviceAuthorizationRoute } from '@app/apps/apis/identity-devices-api/routes/GetDeviceAuthorizationRoute';
import { GetDeviceSealingViewRoute } from '@app/apps/apis/identity-devices-api/routes/GetDeviceSealingViewRoute';
import { PutDeviceSealingRecordRoute } from '@app/apps/apis/identity-devices-api/routes/PutDeviceSealingRecordRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import DeviceSealingViewFinder from '@app/contexts/identity-devices/application/find/DeviceSealingViewFinder';
import DeviceSealingRecordPublisher from '@app/contexts/identity-devices/application/publish/DeviceSealingRecordPublisher';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DEVICE_SEALING_RECORD_HEAD_PREFIX } from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceSealingRecordRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealingRecordRepository';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import OrbitDBDeviceSealingRecordRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceSealingRecordRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { Server } from 'http';
import { mock, MockProxy } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

import {
  networkRegistryOf,
  PRIVATE_NETWORK,
  registryStoresOf,
  sealingPublicKeyOf,
  signedRecordPrimitives,
} from '../../../contexts/identity-devices/DeviceSealingRecordFixtures';

const ONE_DAY_MS = 86_400_000;
const NOT_AUTHORIZED = 422040;
const NOT_FOUND = 404050;
const RATE_LIMITED = 429030;
const INVALID_PAGE = 400050;
const BASE = '/api/identity-devices';

const dayOf = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * ONE_DAY_MS).toISOString().slice(0, 10);

const wire = (pair: KeyPair): string =>
  new IdentityId(pair.toPrimitives().publicKey).valueOf();

describe('Device sealing routes', () => {
  let server: Server;
  let baseUrl: string;
  let registry: OrbitDBReplicatedStateRegistry;
  let identityPair: KeyPair;
  let identityId: IdentityId;
  let owner: KeyPair;
  let phone: KeyPair;
  let stranger: KeyPair;
  let authorization: DeviceAuthorization;
  let transitions: DeviceAuthorizationTransition[];
  let authorizationRepository: MockProxy<DeviceAuthorizationRepository>;

  const enrollment = (
    previousRevision: number,
    author: KeyPair,
    target: KeyPair,
  ): DeviceAuthorizationTransition => {
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      new DeviceAuthorizationRevision(previousRevision),
      DeviceCredential.fromString(author.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Timestamp.now().valueOf() + 60_000),
        Timestamp.now(),
      ),
    );
    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    return proven.authorize(author.sign(proven.getSigningPayload()));
  };

  const signed = (
    method: 'GET' | 'PUT',
    target: string,
    body: unknown = {},
    signer: KeyPair = identityPair,
  ): Record<string, string> => {
    const timestamp = Date.now();
    const content = SignedHttpRequestSignature.signingContent({
      body: body as Record<string, unknown>,
      method,
      path: target,
      timestamp,
    });

    return {
      'x-identity-id': wire(signer),
      'x-signature': signer.sign(content).valueOf(),
      'x-timestamp': String(timestamp),
    };
  };

  const recordPath = (id = identityId.valueOf()): string =>
    `${BASE}/${encodeURIComponent(id)}/sealing-records`;
  const viewPath = (id = identityId.valueOf()): string =>
    `${BASE}/${encodeURIComponent(id)}/sealing-view`;
  const transitionsPath = (query = '', id = identityId.valueOf()): string =>
    `${BASE}/${encodeURIComponent(id)}/transitions${query}`;

  const putRecord = (
    body: unknown,
    options: { signer?: KeyPair; signedBody?: unknown; headers?: boolean } = {},
  ) => {
    const target = recordPath();

    return fetch(`${baseUrl}${target}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(options.headers === false
          ? {}
          : signed('PUT', target, options.signedBody ?? body, options.signer)),
      },
      method: 'PUT',
    });
  };

  const recordBody = (
    overrides: {
      signer?: KeyPair;
      utcDay?: string;
      sealingPublicKey?: string;
      deviceCredential?: string;
    } = {},
  ) => {
    const { record, signature } = signedRecordPrimitives({
      deviceCredential: overrides.deviceCredential,
      identityId: identityId.valueOf(),
      sealingPublicKey: overrides.sealingPublicKey,
      signer: overrides.signer ?? owner,
      utcDay: overrides.utcDay ?? dayOf(0),
    });

    return {
      deviceCredential: record.deviceCredential,
      sealingPublicKey: record.sealingPublicKey,
      signature,
      utcDay: record.utcDay,
    };
  };

  const getSigned = (target: string, signer?: KeyPair) =>
    fetch(`${baseUrl}${target}`, { headers: signed('GET', target, {}, signer) });

  beforeAll(async () => {
    owner = await KeyPair.generate();
    phone = await KeyPair.generate();
    stranger = await KeyPair.generate();
    identityPair = await KeyPair.generate();
    identityId = new IdentityId(identityPair.toPrimitives().publicKey);

    const genesis = DeviceAuthorization.genesis(
      identityId,
      [new NetworkId(PRIVATE_NETWORK)],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(
        (await KeyPair.generate()).toPrimitives().publicKey,
      ),
    );
    const enrolled = enrollment(0, owner, phone);
    transitions = [
      enrolled,
      enrollment(1, owner, await KeyPair.generate()),
      enrollment(2, owner, await KeyPair.generate()),
    ];
    authorization = genesis.enroll(
      DeviceCredential.fromString(phone.toPrimitives().publicKey),
    );
    const states = [genesis, authorization];

    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(PRIVATE_NETWORK, registryStoresOf());
    registry.cacheHeadLocally(`device-authorization:${identityId.valueOf()}`, {
      authorization: authorization.toPrimitives(),
    });
    const sealingRepository = new OrbitDBDeviceSealingRecordRepository(
      registry,
      networkRegistryOf(),
    );

    authorizationRepository = mock<DeviceAuthorizationRepository>();
    authorizationRepository.require.mockImplementation(async (id) => {
      if (!id.isEqual(identityId)) throw new DeviceAuthorizationNotFoundError();

      return authorization;
    });
    authorizationRepository.requireTransitionLog.mockImplementation(
      async (id) => {
        if (!id.isEqual(identityId)) {
          throw new DeviceAuthorizationNotFoundError();
        }

        return new DeviceAuthorizationTransitionLog([], [], transitions, states);
      },
    );

    const blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    const services = new Map<unknown, unknown>([
      [
        SignedHttpRequestAuthenticator,
        new SignedHttpRequestAuthenticator(
          blockPolicy,
          mock<IdentityRepository>(),
          mock<NodeRepository>(),
        ),
      ],
      [DeviceAuthorizationFinder, new DeviceAuthorizationFinder(authorizationRepository)],
      [
        DeviceSealingRecordPublisher,
        new DeviceSealingRecordPublisher(
          sealingRepository as DeviceSealingRecordRepository,
        ),
      ],
      [
        DeviceSealingViewFinder,
        new DeviceSealingViewFinder(
          authorizationRepository,
          sealingRepository as DeviceSealingRecordRepository,
        ),
      ],
      [
        DeviceAuthorizationTransitionReadRateLimiter,
        new DeviceAuthorizationTransitionReadRateLimiter(),
      ],
      [DeviceSealingViewRateLimiter, new DeviceSealingViewRateLimiter()],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) => services.get(service)) as never);

    const app = createExpressServer({
      controllers: [
        GetDeviceAuthorizationRoute,
        GetDeviceSealingViewRoute,
        PutDeviceSealingRecordRoute,
      ],
      defaultErrorHandler: false,
      routePrefix: '/api',
    });
    app.use(
      new HttpErrorHandler({
        handlers: [handleDomainError, handleCustomHttpError],
      }).handle,
    );
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    registry.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  describe('PUT /identity-devices/{identityId}/sealing-records', () => {
    it('creates the record with 201, then answers an identical repeat with 200', async () => {
      const body = recordBody({ sealingPublicKey: sealingPublicKeyOf(7) });

      const created = await putRecord(body);
      const repeated = await putRecord(body);

      expect(created.status).toBe(201);
      expect(repeated.status).toBe(200);
      expect(
        registry.findCachedHeadsByPrefix(
          `${DEVICE_SEALING_RECORD_HEAD_PREFIX}${identityId.valueOf()}:${wire(owner)}:${dayOf(0)}`,
        ),
      ).toHaveLength(1);
    });

    it('answers 409 for another sealing key of the same identity, device and day', async () => {
      const first = recordBody({
        deviceCredential: wire(phone),
        sealingPublicKey: sealingPublicKeyOf(1),
        signer: phone,
      });
      const other = recordBody({
        deviceCredential: wire(phone),
        sealingPublicKey: sealingPublicKeyOf(2),
        signer: phone,
      });

      expect((await putRecord(first)).status).toBe(201);
      const conflict = await putRecord(other);

      expect(conflict.status).toBe(409);
    });

    it('never alters the device authorization head', async () => {
      const key = `device-authorization:${identityId.valueOf()}`;
      const before = JSON.stringify(registry.findCachedHead(key));

      await putRecord(
        recordBody({
          sealingPublicKey: sealingPublicKeyOf(9),
          utcDay: dayOf(-1),
        }),
      );

      expect(JSON.stringify(registry.findCachedHead(key))).toBe(before);
    });

    it.each([
      ['a credential the head does not authorize', () => recordBody({ signer: stranger })],
      ['a day older than yesterday', () => recordBody({ utcDay: dayOf(-3) })],
      ['a day after today', () => recordBody({ utcDay: dayOf(2) })],
      [
        'a signature by another key',
        () => ({
          ...recordBody({ sealingPublicKey: sealingPublicKeyOf(5) }),
          signature: recordBody({ signer: stranger }).signature,
        }),
      ],
      [
        'an oversize sealing key',
        () => ({ ...recordBody(), sealingPublicKey: 'A'.repeat(4096) }),
      ],
      ['a malformed day', () => ({ ...recordBody(), utcDay: '2026-13-45' })],
    ])('answers 422 for %s', async (_name, build) => {
      const response = await putRecord(build());
      const payload = (await response.json()) as { code: number };

      expect(response.status).toBe(422);
      expect(payload.code).toBe(NOT_AUTHORIZED);
    });

    it('answers 401 to an unsigned request and stores nothing', async () => {
      const response = await putRecord(
        recordBody({ sealingPublicKey: sealingPublicKeyOf(11) }),
        { headers: false },
      );

      expect(response.status).toBe(401);
    });

    it('answers 401 when the signer is another identity than the path', async () => {
      const response = await putRecord(
        recordBody({ sealingPublicKey: sealingPublicKeyOf(12) }),
        { signer: stranger },
      );

      expect(response.status).toBe(401);
    });

    it('refuses fields outside the contract with 400', async () => {
      const response = await putRecord({ ...recordBody(), label: 'x' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /identity-devices/{identityId}/sealing-view', () => {
    it('serves the public view of today and yesterday without authentication', async () => {
      await putRecord(
        recordBody({
          sealingPublicKey: sealingPublicKeyOf(21),
          signer: owner,
          utcDay: dayOf(-1),
        }),
      );
      const response = await fetch(`${baseUrl}${viewPath()}`);
      const view = (await response.json()) as {
        devices: {
          deviceCredential: string;
          sealingKeys: { utcDay: string; sealingPublicKey: string }[];
        }[];
        identityId: string;
        revision: number;
      };

      expect(response.status).toBe(200);
      expect(Object.keys(view).sort()).toEqual([
        'devices',
        'identityId',
        'revision',
      ]);
      expect(view.identityId).toBe(identityId.valueOf());
      expect(view.revision).toBe(authorization.getRevision().valueOf());
      expect(view.devices.map(({ deviceCredential }) => deviceCredential)).toEqual(
        [wire(owner), wire(phone)].sort(),
      );
      view.devices.forEach((device) => {
        expect(Object.keys(device).sort()).toEqual([
          'deviceCredential',
          'sealingKeys',
        ]);
        device.sealingKeys.forEach((key) => {
          expect(Object.keys(key).sort()).toEqual([
            'sealingPublicKey',
            'utcDay',
          ]);
          expect([dayOf(0), dayOf(-1)]).toContain(key.utcDay);
        });
      });
      expect(
        view.devices.find((device) => device.deviceCredential === wire(owner))
          ?.sealingKeys,
      ).toContainEqual({
        sealingPublicKey: sealingPublicKeyOf(21),
        utcDay: dayOf(-1),
      });
    });

    it('answers 404 for an identity this node does not hold', async () => {
      const response = await fetch(
        `${baseUrl}${viewPath(wire(stranger))}`,
      );
      const payload = (await response.json()) as { code: number };

      expect(response.status).toBe(404);
      expect(payload.code).toBe(NOT_FOUND);
    });

    it('rate-limits the public read per identity with 429030', async () => {
      const target = viewPath();
      let last = 200;

      for (let attempt = 0; attempt <= 61; attempt += 1) {
        last = (await fetch(`${baseUrl}${target}`)).status;
      }

      expect(last).toBe(429);
      const limited = await fetch(`${baseUrl}${target}`);
      expect(((await limited.json()) as { code: number }).code).toBe(
        RATE_LIMITED,
      );
    });
  });

  describe('GET /identity-devices/{identityId}/transitions', () => {
    it('answers 401 to an anonymous read', async () => {
      const response = await fetch(`${baseUrl}${transitionsPath()}`);

      expect(response.status).toBe(401);
    });

    it('serves the signed transitions to a signed caller of another identity', async () => {
      const target = transitionsPath();
      const response = await getSigned(target, stranger);
      const log = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(Object.keys(log).sort()).toEqual([
        'concurrentRecoveries',
        'identityId',
        'nextCursor',
        'recoveries',
        'transitions',
      ]);
      expect(log.transitions).toEqual(
        transitions.map((transition) => transition.toPrimitives()),
      );
      expect(log.nextCursor).toBeNull();
      expect(JSON.stringify(log)).not.toContain('sealedSecrets');
    });

    it('pages by revision with cursor and limit', async () => {
      const first = (await (
        await getSigned(transitionsPath('?limit=2'), stranger)
      ).json()) as { nextCursor: string | null; transitions: unknown[] };
      const second = (await (
        await getSigned(
          transitionsPath(`?cursor=${first.nextCursor}&limit=2`),
          stranger,
        )
      ).json()) as { nextCursor: string | null; transitions: unknown[] };

      expect(first.transitions).toHaveLength(2);
      expect(first.nextCursor).toBe('2');
      expect(second.transitions).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
    });

    it.each([
      ['?limit=0'],
      ['?limit=101'],
      ['?limit=abc'],
      ['?limit=1.5'],
      ['?cursor=01'],
      ['?cursor=-1'],
      ['?after=1'],
    ])('answers 400050 for the query %s', async (query) => {
      const response = await getSigned(transitionsPath(query), stranger);

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: number }).code).toBe(
        INVALID_PAGE,
      );
    });

    it('rate-limits each signed caller with 429030', async () => {
      const reader = await KeyPair.generate();
      let last = 200;

      for (let attempt = 0; attempt <= 61; attempt += 1) {
        last = (await getSigned(transitionsPath(), reader)).status;
      }

      expect(last).toBe(429);
      expect(
        ((await (await getSigned(transitionsPath(), reader)).json()) as {
          code: number;
        }).code,
      ).toBe(RATE_LIMITED);
      expect((await getSigned(transitionsPath(), stranger)).status).toBe(200);
    });
  });
});
