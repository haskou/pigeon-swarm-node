import DeviceAuthorizationTransitionClientRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionClientRateLimiter';
import DeviceAuthorizationTransitionReadRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionReadRateLimiter';
import DeviceSealingRecordRateLimiter from '@app/apps/apis/identity-devices-api/DeviceSealingRecordRateLimiter';
import DeviceSealingViewCache from '@app/apps/apis/identity-devices-api/DeviceSealingViewCache';
import DeviceSealingViewClientRateLimiter from '@app/apps/apis/identity-devices-api/DeviceSealingViewClientRateLimiter';
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
import { IdentityIdMother } from '../../../mothers/IdentityIdMother';

const ONE_DAY_MS = 86_400_000;
const NOT_AUTHORIZED = 422040;
const NOT_FOUND = 404050;
const RATE_LIMITED = 429030;
const INVALID_PAGE = 400050;
const NOT_SERVED = 403014;
const NON_CANONICAL = 400080;
const BASE = '/api/identity-devices';

const dayOf = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * ONE_DAY_MS).toISOString().slice(0, 10);

const wire = (pair: KeyPair): string =>
  new IdentityId(pair.toPrimitives().publicKey).valueOf();

let addressCounter = 0;
const nextAddress = (): string => {
  addressCounter += 1;

  return `10.${Math.floor(addressCounter / 62_500)}.${Math.floor(addressCounter / 250) % 250}.${(addressCounter % 250) + 1}`;
};

describe('Device sealing routes', () => {
  let clientAddress: string;
  let heldIdentityIds: Set<string>;
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
  let heldReader: KeyPair;

  const heldReaderOf = async (): Promise<KeyPair> => {
    const reader = await KeyPair.generate();

    heldIdentityIds.add(wire(reader));

    return reader;
  };

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
      'x-forwarded-for': clientAddress,
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
        'x-forwarded-for': clientAddress,
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

  const getSigned = (
    target: string,
    signer?: KeyPair,
    address: string = clientAddress,
  ) =>
    fetch(`${baseUrl}${target}`, {
      headers: {
        ...signed('GET', target, {}, signer),
        'x-forwarded-for': address,
      },
    });

  const getPublic = (target: string, address: string = clientAddress) =>
    fetch(`${baseUrl}${target}`, { headers: { 'x-forwarded-for': address } });

  beforeEach(() => {
    clientAddress = nextAddress();
  });

  beforeAll(async () => {
    owner = await KeyPair.generate();
    phone = await KeyPair.generate();
    stranger = await KeyPair.generate();
    identityPair = await KeyPair.generate();
    heldIdentityIds = new Set();
    identityId = new IdentityId(identityPair.toPrimitives().publicKey);
    heldIdentityIds.add(identityId.valueOf());
    heldReader = await heldReaderOf();

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

        return new DeviceAuthorizationTransitionLog(
          [],
          [],
          transitions,
          states,
        );
      },
    );

    const identities = mock<IdentityRepository>();
    identities.holds.mockImplementation((id) =>
      Promise.resolve(heldIdentityIds.has(id.valueOf())),
    );
    const blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    const services = new Map<unknown, unknown>([
      [
        SignedHttpRequestAuthenticator,
        new SignedHttpRequestAuthenticator(
          blockPolicy,
          identities,
          mock<NodeRepository>(),
        ),
      ],
      [
        DeviceAuthorizationFinder,
        new DeviceAuthorizationFinder(authorizationRepository),
      ],
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
      [
        DeviceSealingViewClientRateLimiter,
        new DeviceSealingViewClientRateLimiter(),
      ],
      [
        DeviceAuthorizationTransitionClientRateLimiter,
        new DeviceAuthorizationTransitionClientRateLimiter(),
      ],
      [DeviceSealingViewCache, new DeviceSealingViewCache()],
      [DeviceSealingRecordRateLimiter, new DeviceSealingRecordRateLimiter()],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) =>
        services.get(service)) as never);

    const app = createExpressServer({
      controllers: [
        GetDeviceAuthorizationRoute,
        GetDeviceSealingViewRoute,
        PutDeviceSealingRecordRoute,
      ],
      defaultErrorHandler: false,
      routePrefix: '/api',
    });
    app.set('trust proxy', true);
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
      [
        'a credential the head does not authorize',
        () => recordBody({ signer: stranger }),
      ],
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
          deviceCredential: wire(phone),
          sealingPublicKey: sealingPublicKeyOf(21),
          signer: phone,
          utcDay: dayOf(-1),
        }),
      );
      const response = await getPublic(viewPath());
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
      expect(
        view.devices.map(({ deviceCredential }) => deviceCredential),
      ).toEqual([wire(owner), wire(phone)].sort());
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
        view.devices.find((device) => device.deviceCredential === wire(phone))
          ?.sealingKeys,
      ).toContainEqual({
        sealingPublicKey: sealingPublicKeyOf(21),
        utcDay: dayOf(-1),
      });
    });

    it('answers 404 for an identity this node does not hold', async () => {
      const response = await getPublic(viewPath(wire(stranger)));
      const payload = (await response.json()) as { code: number };

      expect(response.status).toBe(404);
      expect(payload.code).toBe(NOT_FOUND);
    });

    it('rate-limits each client address with 429030', async () => {
      const target = viewPath();
      let last = 200;

      for (let attempt = 0; attempt <= 61; attempt += 1) {
        last = (await getPublic(target)).status;
      }

      expect(last).toBe(429);
      const limited = await getPublic(target);
      expect(((await limited.json()) as { code: number }).code).toBe(
        RATE_LIMITED,
      );
    });

    it('keeps serving other addresses while one address floods the read', async () => {
      const target = viewPath();
      const flooder = nextAddress();

      for (let attempt = 0; attempt <= 70; attempt += 1) {
        await getPublic(target, flooder);
      }

      expect((await getPublic(target, flooder)).status).toBe(429);
      expect((await getPublic(target, nextAddress())).status).toBe(200);
    });

    it('lets one address exhaust neither the per-target nor the node budget', () => {
      expect(DeviceSealingViewClientRateLimiter.ADDRESS_LIMIT).toBeLessThan(
        DeviceSealingViewRateLimiter.IDENTITY_LIMIT,
      );
      expect(DeviceSealingViewRateLimiter.IDENTITY_LIMIT).toBeLessThan(
        DeviceSealingViewRateLimiter.NODE_LIMIT,
      );
    });

    it('serves a repeated read from a short cache without asking the authorization again', async () => {
      const target = viewPath();

      await getPublic(target);
      authorizationRepository.require.mockClear();
      const repeated = await getPublic(target, nextAddress());

      expect(repeated.status).toBe(200);
      expect(authorizationRepository.require).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown identity without caching the miss', async () => {
      const target = viewPath(wire(stranger));

      await getPublic(target);

      expect((await getPublic(target, nextAddress())).status).toBe(404);
    });

    it('refuses a non-canonical identity id with 400080 before any budget is spent', async () => {
      const consume = jest.spyOn(
        DeviceSealingViewRateLimiter.prototype,
        'consume',
      );
      const alias = IdentityIdMother.aliasPrefix(identityId).valueOf();
      const response = await getPublic(viewPath(alias));

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: number }).code).toBe(
        NON_CANONICAL,
      );
      expect(consume).not.toHaveBeenCalled();
      consume.mockRestore();
    });

    it('answers 409 with the error class name for a malformed identity id', async () => {
      const response = await getPublic(viewPath('not-a-key'));
      const payload = (await response.json()) as { code: unknown };

      expect(response.status).toBe(409);
      expect(typeof payload.code).toBe('string');
    });
  });

  describe('GET /identity-devices/{identityId}/transitions', () => {
    it('answers 401 to an anonymous read', async () => {
      const response = await fetch(`${baseUrl}${transitionsPath()}`);

      expect(response.status).toBe(401);
    });

    it('serves the transitions to a signed caller this node serves', async () => {
      const target = transitionsPath();
      const response = await getSigned(target, heldReader);
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
        await getSigned(transitionsPath('?limit=2'), heldReader)
      ).json()) as { nextCursor: string | null; transitions: unknown[] };
      const second = (await (
        await getSigned(
          transitionsPath(`?cursor=${first.nextCursor}&limit=2`),
          heldReader,
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
      const response = await getSigned(transitionsPath(query), heldReader);

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: number }).code).toBe(
        INVALID_PAGE,
      );
    });

    it.each([
      ['a throwaway key', () => KeyPair.generate()],
      ['an identity of another node', () => Promise.resolve(stranger)],
    ])(
      'answers 403014 to a signed caller that is %s and reads nothing',
      async (_label, build) => {
        authorizationRepository.requireTransitionLog.mockClear();
        const response = await getSigned(transitionsPath(), await build());

        expect(response.status).toBe(403);
        expect(((await response.json()) as { code: number }).code).toBe(
          NOT_SERVED,
        );
        expect(
          authorizationRepository.requireTransitionLog,
        ).not.toHaveBeenCalled();
      },
    );

    it('keeps answering 401 to an anonymous read before the served check', async () => {
      expect((await getPublic(transitionsPath())).status).toBe(401);
    });

    it('rate-limits each served requester with 429030 across addresses', async () => {
      const reader = await heldReaderOf();
      let last = 200;

      for (let attempt = 0; attempt <= 61; attempt += 1) {
        last = (await getSigned(transitionsPath(), reader, nextAddress()))
          .status;
      }

      expect(last).toBe(429);
      expect(
        (
          (await (
            await getSigned(transitionsPath(), reader, nextAddress())
          ).json()) as { code: number }
        ).code,
      ).toBe(RATE_LIMITED);
      expect((await getSigned(transitionsPath(), heldReader)).status).toBe(200);
    });

    it('rate-limits each client address so one address cannot starve another', async () => {
      const flooder = nextAddress();
      const reader = await heldReaderOf();
      const other = await heldReaderOf();
      let last = 200;

      for (let attempt = 0; attempt <= 61; attempt += 1) {
        last = (await getSigned(transitionsPath(), reader, flooder)).status;
      }

      expect(last).toBe(429);
      expect(
        (await getSigned(transitionsPath(), other, nextAddress())).status,
      ).toBe(200);
    });
  });

  describe('sealing record publication budget', () => {
    it('rate-limits one identity with 429030 once its publication budget is spent', async () => {
      const statuses: number[] = [];

      for (
        let attempt = 0;
        attempt <= DeviceSealingRecordRateLimiter.IDENTITY_LIMIT + 1 &&
        !statuses.includes(429);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        const response = await putRecord(
          recordBody({ sealingPublicKey: sealingPublicKeyOf(7) }),
        );

        statuses.push(response.status);
      }

      expect(statuses.at(-1)).toBe(429);
    });
  });
});
