import { GetCommunitiesRoute } from '@app/apps/apis/communities-api/routes/GetCommunitiesRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeReadiness from '@app/apps/NodeReadiness';
import CommunitiesFinder from '@app/contexts/communities/application/find-communities/CommunitiesFinder';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import LocalNodeMetadataRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeMetadataRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { promises as fs } from 'fs';
import { Server } from 'http';
import { mock } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { createExpressServer } from 'routing-controllers';

type Configuration = 'empty' | 'populated' | 'unreadable';

interface Scenario {
  started: boolean;
  replicatedStateOpen: boolean;
  hasNetworks: boolean;
  configuration: Configuration;
}

const LIST_PATH = '/api/communities';
// Where LocalNodeMetadataRepository keeps the persisted node configuration.
const NODE_METADATA_NAMESPACE = 'node_metadata';
const LOCAL_NODE_ID = 'local';

describe('Get communities route readiness gate', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let server: Server;
  let baseUrl: string;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalNodeMetadataRepository;
  let readiness: NodeReadiness;
  let find: jest.Mock;
  let keyPair: KeyPair;
  let identityId: IdentityId;

  /**
   * Writes the persisted configuration as the node stores it, so the real
   * repository decides whether that configuration is empty.
   */
  const persistConfiguration = async (
    configuration: Configuration,
  ): Promise<void> => {
    if (configuration === 'unreadable') {
      // Without a node id this is not a node document, so it cannot be verified.
      await database.save(NODE_METADATA_NAMESPACE, LOCAL_NODE_ID, {
        _id: LOCAL_NODE_ID,
        networks: {},
      });

      return;
    }

    // Only the network keys matter for emptiness, so the values stay minimal.
    await database.save(NODE_METADATA_NAMESPACE, LOCAL_NODE_ID, {
      _id: LOCAL_NODE_ID,
      nodeId: 'test-node',
      networks: configuration === 'empty' ? {} : { 'test-network': {} },
    });
  };

  const build = (next: Scenario): NodeReadiness => {
    const built = new NodeReadiness(
      {
        isOpen: () => next.replicatedStateOpen,
        hasNetworks: () => next.hasNetworks,
      } as unknown as OrbitDBReplicatedStateRegistry,
      repository,
    );

    if (next.started) built.markStarted();

    return built;
  };

  /** A GET to the target signed by the requester's key, as the UI sends it. */
  const signedHeaders = (target = LIST_PATH): Record<string, string> => {
    const timestamp = Date.now();
    const content = SignedHttpRequestSignature.signingContent({
      body: {},
      method: 'GET',
      path: target,
      timestamp,
    });

    return {
      'x-identity-id': identityId.valueOf(),
      'x-signature': keyPair.sign(content).valueOf(),
      'x-timestamp': String(timestamp),
    };
  };

  const getCommunities = (
    headers: Record<string, string> = signedHeaders(),
  ) => fetch(`${baseUrl}${LIST_PATH}`, { method: 'GET', headers });

  /** A signed GET with a query string; the signature covers the query too. */
  const getCommunitiesWithQuery = (query: string) => {
    const target = `${LIST_PATH}?${query}`;

    return fetch(`${baseUrl}${target}`, {
      method: 'GET',
      headers: signedHeaders(target),
    });
  };

  beforeAll(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'communities-route-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalNodeMetadataRepository(
      database,
      mock<IPFSNetworkRegistry>(),
      new LocalNodeMetadataMapper(),
    );

    keyPair = await KeyPair.generate();
    identityId = new IdentityId(keyPair.toPrimitives().publicKey);

    // The real authenticator verifies the signature. Block lookups are local
    // and not under test, so nobody is blocked.
    const blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    const authenticator = new SignedHttpRequestAuthenticator(
      blockPolicy,
      mock<IdentityRepository>(),
      mock<NodeRepository>(),
    );

    // The route is constructed once per process, so the collaborators below
    // read the current scenario instead of capturing one at construction.
    const services = new Map<unknown, unknown>([
      [NodeReadiness, { isReady: () => readiness.isReady() }],
      [CommunityFinder, {}],
      [SignedHttpRequestAuthenticator, authenticator],
      [
        CommunitiesFinder,
        {
          find: (...args: unknown[]) => find(...args),
        },
      ],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) => services.get(service)) as never);

    find = jest.fn();
    await useScenario({
      started: true,
      replicatedStateOpen: true,
      hasNetworks: false,
      configuration: 'empty',
    });

    const app = createExpressServer({
      controllers: [GetCommunitiesRoute],
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

  beforeEach(() => {
    find.mockReset();
    find.mockResolvedValue({
      getItems: (): unknown[] => [],
      getNextPosition: (): undefined => undefined,
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await database.close();
    if (previousPath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousPath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  const useScenario = async (next: Scenario): Promise<void> => {
    await persistConfiguration(next.configuration);
    readiness = build(next);
  };

  const expectNotReady = async (next: Scenario): Promise<void> => {
    await useScenario(next);

    const response = await getCommunities();
    const body = (await response.json()) as { code: number };

    expect(response.status).toBe(503);
    expect(body.code).toBe(503020);
    expect(find).not.toHaveBeenCalled();
  };

  it('answers 503020 before startup has finished, even when the replicated state is open', async () => {
    await expectNotReady({
      started: false,
      replicatedStateOpen: true,
      hasNetworks: false,
      configuration: 'empty',
    });
  });

  it('answers 503020 while a registered network has not finished replaying', async () => {
    await expectNotReady({
      started: true,
      replicatedStateOpen: false,
      hasNetworks: true,
      configuration: 'populated',
    });
  });

  it('answers 503020 when no network is registered but the persisted configuration is not empty', async () => {
    await expectNotReady({
      started: true,
      replicatedStateOpen: false,
      hasNetworks: false,
      configuration: 'populated',
    });
  });

  it('answers 503020 when the persisted configuration is malformed', async () => {
    await expectNotReady({
      started: true,
      replicatedStateOpen: false,
      hasNetworks: false,
      configuration: 'unreadable',
    });
  });

  it('answers 503020 when readiness drops while the list is read, so an empty page is not answered as verified', async () => {
    await useScenario({
      started: true,
      replicatedStateOpen: true,
      hasNetworks: false,
      configuration: 'empty',
    });
    // Ready at the gate and not ready once the page is read: the page was read
    // across a readiness change, so an empty page cannot be answered as verified.
    find.mockImplementationOnce(async () => {
      await useScenario({
        started: true,
        replicatedStateOpen: false,
        hasNetworks: true,
        configuration: 'populated',
      });

      return {
        getItems: (): unknown[] => [],
        getNextPosition: (): undefined => undefined,
      };
    });

    const response = await getCommunities();
    const body = (await response.json()) as { code: number };

    expect(find).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
    expect(body.code).toBe(503020);
  });

  it('keeps answering 401 for an unsigned request while not ready, so the signature is checked first', async () => {
    await useScenario({
      started: true,
      replicatedStateOpen: false,
      hasNetworks: true,
      configuration: 'populated',
    });

    const response = await getCommunities({});
    const body = (await response.json()) as { code: number };

    expect(response.status).toBe(401);
    expect(body.code).toBe(401021);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 503020 for a malformed cursor while not ready, so readiness is checked before the query', async () => {
    await useScenario({
      started: false,
      replicatedStateOpen: false,
      hasNetworks: false,
      configuration: 'empty',
    });

    const response = await getCommunitiesWithQuery('cursor=%21%21%21');
    const body = (await response.json()) as { code: number };

    expect(response.status).toBe(503);
    expect(body.code).toBe(503020);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 400 for the same malformed cursor once ready', async () => {
    await useScenario({
      started: true,
      replicatedStateOpen: true,
      hasNetworks: true,
      configuration: 'populated',
    });

    const response = await getCommunitiesWithQuery('cursor=%21%21%21');
    const body = (await response.json()) as { code: number };

    expect(response.status).toBe(400);
    expect(body.code).toBe(400110);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 200 with an empty list once the replicated state is open and verified empty', async () => {
    await useScenario({
      started: true,
      replicatedStateOpen: true,
      hasNetworks: true,
      configuration: 'populated',
    });

    const response = await getCommunities();
    const body = (await response.json()) as { communities: unknown[] };

    expect(response.status).toBe(200);
    expect(body.communities).toEqual([]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('answers 200 with an empty list for a started fresh node with no networks and an empty configuration', async () => {
    await useScenario({
      started: true,
      replicatedStateOpen: false,
      hasNetworks: false,
      configuration: 'empty',
    });

    const response = await getCommunities();
    const body = (await response.json()) as { communities: unknown[] };

    expect(response.status).toBe(200);
    expect(body.communities).toEqual([]);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
