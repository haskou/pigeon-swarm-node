import { readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { getMetadataArgsStorage } from 'routing-controllers';
import YAML from 'yaml';

import { applicationRoutes } from '../../../../src/apps/ApplicationRoutes';
import HealthRoute from '../../../../src/shared/infrastructure/ui/routes/HealthRoute';

type OpenAPIDocument = {
  paths?: Record<string, OpenAPIPathItem>;
};

type OpenAPIPathItem = Record<string, unknown> & { $ref?: string };

type Segment = {
  next: string;
  previous: string;
  siblings: string[];
  value: string;
};

const apisRoot = resolve(__dirname, '../../../../src/apps/apis');
const httpMethods = ['delete', 'get', 'patch', 'post', 'put'];

// Operations served outside routing-controllers.
const nonControllerOperations = ['GET /realtime'];

// Path segments that are not plural collections: documented singletons and
// API namespaces (see "Path conventions" in docs/api.md).
const singularSegments: Record<string, true> = {
  'client-contract': true,
  diagnostics: true,
  draft: true,
  favorite: true,
  frontier: true,
  'invitation-preview': true,
  ipfs: true,
  library: true,
  mls: true,
  node: true,
  owner: true,
  pin: true,
  'private-authorization': true,
  publication: true,
  push: true,
  readiness: true,
  realtime: true,
  registration: true,
  'relay-configuration': true,
  'replication-status': true,
  revocation: true,
  saved: true,
  thread: true,
  usage: true,
  'vapid-public-key': true,
};

// Collections keyed by identity id, where `me` names the caller's own item.
const identityKeyedCollections: Record<string, true> = {
  members: true,
  participants: true,
  presence: true,
  votes: true,
};

const verbs: Record<string, true> = {
  accept: true,
  ack: true,
  approve: true,
  close: true,
  discover: true,
  heartbeat: true,
  join: true,
  kick: true,
  leave: true,
  publish: true,
  reject: true,
  search: true,
  send: true,
  test: true,
  used: true,
};

// Documented exceptions (docs/api.md, "Path conventions"): RPC-style
// operations with no resource to write.
const exceptions: Record<string, string> = {
  'POST /mailboxes/{mailboxId}/ack': 'RPC: advances a reader cursor',
  'POST /push/test': 'RPC: sends a test notification',
};

// Verb-style operations that issue #606 replaced with resource and method
// semantics. None of them may be served again.
const removedOperations = [
  'DELETE /communities/{communityId}/members/{identityId}/kick',
  'GET /calls/history',
  'GET /calls/ice-servers',
  'GET /communities/discover',
  'POST /calls/{callId}/participants/me/heartbeat',
  'POST /communities/{communityId}/channels/text',
  'POST /communities/{communityId}/channels/voice',
  'POST /ipfs/public',
  'POST /node/networks/public',
  'POST /polls/{pollId}/close',
  'POST /stickers/packs/{packId}/stickers/{stickerId}/used',
];

function readYaml(file: string): OpenAPIDocument {
  return YAML.parse(readFileSync(file, 'utf8')) as OpenAPIDocument;
}

function operationsOf(paths: Record<string, OpenAPIPathItem>): string[] {
  return Object.entries(paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((key) => httpMethods.includes(key))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

function handlerOperations(): string[] {
  const storage = getMetadataArgsStorage();
  const apiRoutes = applicationRoutes.filter((route) => route !== HealthRoute);

  return storage.actions
    .filter((action) => apiRoutes.includes(action.target as never))
    .map((action) => {
      const controller = storage.controllers.find(
        (candidate) => candidate.target === action.target,
      );
      const path = `${controller?.route ?? ''}${(action.route as string) ?? ''}`;

      return `${action.type.toUpperCase()} ${path.replace(/:(\w+)/g, '{$1}')}`;
    });
}

type RegisteredHandler = { method: string; order: number; path: string };

function registeredHandlers(): RegisteredHandler[] {
  const storage = getMetadataArgsStorage();

  return storage.actions.flatMap((action) => {
    const order = applicationRoutes.indexOf(action.target as never);

    if (order < 0) return [];

    const controller = storage.controllers.find(
      (candidate) => candidate.target === action.target,
    );

    return [
      {
        method: action.type,
        order,
        path: `${controller?.route ?? ''}${(action.route as string) ?? ''}`,
      },
    ];
  });
}

// True when `literal` names one concrete path that `pattern` also matches.
function shadows(pattern: string, literal: string): boolean {
  const patternSegments = pattern.split('/');
  const literalSegments = literal.split('/');

  return (
    pattern !== literal &&
    patternSegments.length === literalSegments.length &&
    patternSegments.every(
      (segment, index) =>
        segment.startsWith(':') || segment === literalSegments[index],
    )
  );
}

function apiSwaggerFiles(): string[] {
  return readdirSync(apisRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-api'))
    .map((entry) => join(apisRoot, entry.name, 'swagger.yaml'));
}

function apiSwaggerOperations(): string[] {
  return apiSwaggerFiles().flatMap((file) =>
    operationsOf(readYaml(file).paths ?? {}),
  );
}

function aggregatedOperations(): string[] {
  const aggregatedFile = join(apisRoot, 'open-api.yaml');
  const paths = readYaml(aggregatedFile).paths ?? {};

  return Object.entries(paths).flatMap(([path, item]) => {
    if (!item.$ref) {
      return operationsOf({ [path]: item });
    }
    const [file, pointer] = item.$ref.split('#');
    const referencedPath = pointer
      .replace(/^\/paths\//, '')
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');

    expect(referencedPath).toBe(path);

    const referenced = readYaml(resolve(dirname(aggregatedFile), file));

    return operationsOf({ [path]: referenced.paths?.[referencedPath] ?? {} });
  });
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isParameter(segment: string): boolean {
  return /^\{[a-z][A-Za-z0-9]*\}$/.test(segment);
}

// Each rule names what is wrong with a static segment, or nothing.
const segmentRules: ((segment: Segment) => string | undefined)[] = [
  ({ value }) =>
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value)
      ? undefined
      : `"${value}" is not a kebab-case noun`,
  ({ value }) =>
    /^v\d+$/.test(value) ? `"${value}" is a version segment` : undefined,
  ({ value }) => (verbs[value] ? `"${value}" is a verb` : undefined),
  ({ previous, value }) =>
    value === 'me' && !identityKeyedCollections[previous]
      ? '"me" outside an identity-keyed collection'
      : undefined,
  ({ value }) =>
    value === 'me' ||
    value.endsWith('s') ||
    singularSegments[value] ||
    identityKeyedCollections[value]
      ? undefined
      : `"${value}" is neither plural nor a singleton`,
  ({ next, value }) =>
    singularSegments[value] && isParameter(next)
      ? `singleton "${value}" is keyed by a parameter`
      : undefined,
  ({ siblings, value }) =>
    value !== 'me' && siblings.some(isParameter)
      ? `"${value}" sits beside a path parameter`
      : undefined,
];

function violationsOf(operation: string, allPaths: string[]): string[] {
  const path = operation.split(' ')[1];
  const segments = path.split('/').filter(Boolean);
  const trailingSlash = path.endsWith('/') ? ['trailing slash'] : [];

  return [
    ...trailingSlash,
    ...segments.flatMap((value, index) => {
      if (isParameter(value)) {
        return [];
      }

      const parent = segments.slice(0, index).join('/');
      const siblings = allPaths
        .map((candidate) => candidate.split('/').slice(1))
        .filter((candidate) => candidate.slice(0, index).join('/') === parent)
        .map((candidate) => candidate[index] ?? '');
      const segment: Segment = {
        next: segments[index + 1] ?? '',
        previous: segments[index - 1] ?? '',
        siblings,
        value,
      };

      return segmentRules
        .map((rule) => rule(segment))
        .filter((violation): violation is string => violation !== undefined);
    }),
  ];
}

describe('API path conventions', () => {
  it('should document every handler operation in its API swagger', () => {
    expect(sorted(apiSwaggerOperations())).toEqual(
      sorted([...handlerOperations(), ...nonControllerOperations]),
    );
  });

  it('should aggregate every API swagger operation in open-api.yaml', () => {
    expect(sorted(aggregatedOperations())).toEqual(
      sorted(apiSwaggerOperations()),
    );
  });

  it('should not serve the verb-style operations it replaced', () => {
    const served = new Set([...handlerOperations(), ...apiSwaggerOperations()]);

    expect(
      removedOperations.filter((operation) => served.has(operation)),
    ).toEqual([]);
  });

  it('should register a literal path before the parameter path that also matches it', () => {
    const handlers = registeredHandlers();
    const misordered = handlers.flatMap((pattern) =>
      handlers
        .filter(
          (literal) =>
            literal.method === pattern.method &&
            shadows(pattern.path, literal.path) &&
            literal.order > pattern.order,
        )
        .map(
          (literal) =>
            `${literal.method.toUpperCase()} ${literal.path} is registered after ${pattern.path}`,
        ),
    );

    expect(misordered).toEqual([]);
  });

  it('should only list exceptions that exist', () => {
    const operations = new Set(handlerOperations());

    expect(
      Object.keys(exceptions).filter((exception) => !operations.has(exception)),
    ).toEqual([]);
  });

  it('should follow the path convention on every operation', () => {
    const operations = sorted([
      ...handlerOperations(),
      ...nonControllerOperations,
    ]);
    const allPaths = operations.map((operation) => operation.split(' ')[1]);
    const violations = operations
      .filter((operation) => !exceptions[operation])
      .flatMap((operation) =>
        violationsOf(operation, allPaths).map(
          (violation) => `${operation}: ${violation}`,
        ),
      );

    expect(violations).toEqual([]);
  });

  it('should reject a non-conforming path', () => {
    const allPaths = ['/widgets/{widgetId}', '/widgets/search/'];

    expect(violationsOf('GET /widgets/search/', allPaths)).toEqual([
      'trailing slash',
      '"search" is a verb',
      '"search" is neither plural nor a singleton',
      '"search" sits beside a path parameter',
    ]);
    expect(violationsOf('GET /node/{nodeId}', ['/node/{nodeId}'])).toEqual([
      'singleton "node" is keyed by a parameter',
    ]);
    expect(violationsOf('GET /api/v1/widgets', ['/api/v1/widgets'])).toEqual([
      '"api" is neither plural nor a singleton',
      '"v1" is a version segment',
      '"v1" is neither plural nor a singleton',
    ]);
    expect(violationsOf('GET /widgets/me', ['/widgets/me'])).toEqual([
      '"me" outside an identity-keyed collection',
    ]);
  });
});
