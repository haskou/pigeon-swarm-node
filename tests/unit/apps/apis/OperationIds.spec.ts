import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import YAML from 'yaml';

type OpenAPIOperation = {
  operationId?: unknown;
  responses?: Record<string, unknown>;
};

type OpenAPIDocument = {
  components?: {
    responses?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  paths?: Record<string, Record<string, unknown>>;
};

type ApiOperation = {
  document: OpenAPIDocument;
  file: string;
  id: string;
  operation: OpenAPIOperation;
};

const apisRoot = resolve(__dirname, '../../../../src/apps/apis');
const httpMethods = ['delete', 'get', 'patch', 'post', 'put'];
const operationIdPattern = /^[a-z][A-Za-z0-9]*$/;
const errorResponseRef = '#/components/responses/Error';
const errorSchemaRef = '#/components/schemas/ErrorResponse';

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
        document,
        file,
        id: `${method.toUpperCase()} ${path}`,
        operation: operation as OpenAPIOperation,
      })),
  );
});

function documentsErrorShape({ document, operation }: ApiOperation): boolean {
  const defaultResponse = operation.responses?.default as
    | { $ref?: unknown }
    | undefined;
  const errorResponse = document.components?.responses?.Error as
    | { content?: Record<string, { schema?: { $ref?: unknown } }> }
    | undefined;

  return (
    defaultResponse?.$ref === errorResponseRef &&
    errorResponse?.content?.['application/json']?.schema?.$ref ===
      errorSchemaRef &&
    document.components?.schemas?.ErrorResponse !== undefined
  );
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
      .filter((entry) => !documentsErrorShape(entry))
      .map(({ file, id }) => `${file}: ${id}`);

    expect(undocumented).toEqual([]);
  });
});
