import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

type OpenAPIReference = {
  file: string;
  ref: string;
};

const apisRoot = resolve(__dirname, '../../../../src/apps/apis');
const openAPIFiles = [
  join(apisRoot, 'open-api.yaml'),
  join(apisRoot, 'calls-api/swagger.yaml'),
  join(apisRoot, 'communities-api/swagger.yaml'),
  join(apisRoot, 'conversations-api/swagger.yaml'),
  join(apisRoot, 'identities-api/swagger.yaml'),
  join(apisRoot, 'ipfs-api/swagger.yaml'),
  join(apisRoot, 'keychains-api/swagger.yaml'),
  join(apisRoot, 'nodes-api/swagger.yaml'),
  join(apisRoot, 'notifications-api/swagger.yaml'),
  join(apisRoot, 'stickers-api/swagger.yaml'),
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function readFile(file: string): string {
  return readFileSync(file, 'utf8');
}

function referencesFrom(file: string): OpenAPIReference[] {
  const content = readFile(file);
  const refPattern = /\$ref:\s*['"]?([^'"\s]+)['"]?/g;
  const references: OpenAPIReference[] = [];
  let match = refPattern.exec(content);

  while (match) {
    references.push({ file, ref: match[1] });
    match = refPattern.exec(content);
  }

  return references;
}

function keyLinePattern(key: string, indent: number): RegExp {
  return new RegExp(`^\\s{${indent}}${escapeRegExp(key)}:\\s*(?:$|[^{])`);
}

function findKeyLine(
  lines: string[],
  key: string,
  indent: number,
  startLine: number,
): number | undefined {
  const pattern = keyLinePattern(key, indent);

  for (let lineNumber = startLine; lineNumber < lines.length; lineNumber += 1) {
    if (pattern.test(lines[lineNumber])) {
      return lineNumber;
    }
  }

  return undefined;
}

function pointerExists(file: string, pointer: string): boolean {
  const lines = readFile(file).split('\n');
  const tokens = pointer
    .split('/')
    .filter((token) => token.length > 0)
    .map(decodePointerToken);
  let startLine = 0;

  for (const [index, token] of tokens.entries()) {
    const indent = index * 2;
    const lineNumber = findKeyLine(lines, token, indent, startLine);

    if (lineNumber === undefined) {
      return false;
    }

    startLine = lineNumber + 1;
  }

  return tokens.length > 0;
}

function referencedFile(reference: OpenAPIReference): {
  file: string;
  pointer: string;
} {
  const [fileReference, pointer = ''] = reference.ref.split('#');

  if (!fileReference) {
    return {
      file: reference.file,
      pointer,
    };
  }

  return {
    file: resolve(dirname(reference.file), fileReference),
    pointer,
  };
}

describe('OpenAPI references', () => {
  it('should validate complete nested pointers', () => {
    const callsSwagger = join(apisRoot, 'calls-api/swagger.yaml');

    expect(
      pointerExists(
        callsSwagger,
        '/components/schemas/CallsResource/properties/calls/items',
      ),
    ).toBe(true);
    expect(
      pointerExists(
        callsSwagger,
        '/components/schemas/CallsResource/properties/notReal/items',
      ),
    ).toBe(false);
  });

  it('should resolve every local and external reference', () => {
    const unresolvedReferences = openAPIFiles
      .flatMap((file) => referencesFrom(file))
      .filter((reference) => {
        const target = referencedFile(reference);

        return (
          !existsSync(target.file) || !pointerExists(target.file, target.pointer)
        );
      })
      .map((reference) => `${reference.file}: ${reference.ref}`);

    expect(unresolvedReferences).toEqual([]);
  });
});
