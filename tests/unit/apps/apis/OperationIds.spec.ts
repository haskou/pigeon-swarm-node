import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import YAML from 'yaml';

type OpenAPIOperation = {
  operationId?: unknown;
  responses?: Record<string, { $ref?: unknown }>;
};

type OpenAPIDocument = {
  components?: {
    responses?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  paths?: Record<string, Record<string, unknown>>;
};

type ApiOperation = {
  file: string;
  id: string;
  operation: OpenAPIOperation;
};

const apisRoot = resolve(__dirname, '../../../../src/apps/apis');
const httpMethods = ['delete', 'get', 'patch', 'post', 'put'];
const operationIdPattern = /^[a-z][A-Za-z0-9]*$/;
const errorResponseRef = '../open-api.yaml#/components/responses/Error';
const errorSchemaRef = '#/components/schemas/ErrorResponse';

const aggregated = YAML.parse(
  readFileSync(join(apisRoot, 'open-api.yaml'), 'utf8'),
) as OpenAPIDocument;

const apiFiles = readdirSync(apisRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.endsWith('-api'))
  .map((entry) => join(apisRoot, entry.name, 'swagger.yaml'))
  .filter((file) => existsSync(file));

const operations: ApiOperation[] = apiFiles.flatMap((file) => {
  const document = YAML.parse(readFileSync(file, 'utf8')) as OpenAPIDocument;

  return Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => httpMethods.includes(method))
      .map(([method, operation]) => ({
        file,
        id: `${method.toUpperCase()} ${path}`,
        operation: operation as OpenAPIOperation,
      })),
  );
});

const errorResponse = aggregated.components?.responses?.Error as
  { content?: Record<string, { schema?: { $ref?: unknown } }> } | undefined;
const errorShapeIsShared =
  errorResponse?.content?.['application/json']?.schema?.$ref ===
    errorSchemaRef &&
  aggregated.components?.schemas?.ErrorResponse !== undefined;

function documentsErrorShape(operation: OpenAPIOperation): boolean {
  return (
    operation.responses?.default?.$ref === errorResponseRef &&
    errorShapeIsShared
  );
}

// Convention documented in docs/api.md ("Errors", "Operation ids").
function expectedOperationId(id: string): string {
  const [method, path] = id.split(' ');
  const upperFirst = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const parameter = /^\{(.+)\}$/.exec(segment);
      const name = parameter ? parameter[1] : segment;
      const camel = name
        .split(/[-_]/)
        .map((part, index) => (index === 0 ? part : upperFirst(part)))
        .join('');

      return parameter ? `By${upperFirst(camel)}` : upperFirst(camel);
    });

  return method.toLowerCase() + segments.join('');
}

describe('API operations', () => {
  it('should cover every API operation', () => {
    expect(operations.length).toBeGreaterThan(100);
  });

  it('should give every operation a well-formed operationId', () => {
    const malformed = operations
      .filter(
        ({ operation }) =>
          typeof operation.operationId !== 'string' ||
          !operationIdPattern.test(operation.operationId),
      )
      .map(({ file, id }) => `${file}: ${id}`);

    expect(malformed).toEqual([]);
  });

  it('should keep every operationId unique across the API documents', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const { file, id, operation } of operations) {
      const operationId = String(operation.operationId);
      const previous = seen.get(operationId);

      if (previous !== undefined) {
        duplicates.push(`${operationId}: ${previous} and ${file} ${id}`);
      }

      seen.set(operationId, `${file} ${id}`);
    }

    expect(duplicates).toEqual([]);
  });

  it('should document the shared error shape on every operation', () => {
    const undocumented = operations
      .filter(({ operation }) => !documentsErrorShape(operation))
      .map(({ file, id }) => `${file}: ${id}`);

    expect(undocumented).toEqual([]);
  });

  it('should derive each operationId from its method and path', () => {
    const mismatched = operations
      .map(({ id, operation }) => ({
        actual: String(operation.operationId),
        expected: expectedOperationId(id),
        id,
      }))
      .filter(({ actual, expected }) => actual !== expected)
      .map(({ actual, expected, id }) => `${id}: ${actual} != ${expected}`);

    expect(mismatched).toEqual([]);
  });
});
