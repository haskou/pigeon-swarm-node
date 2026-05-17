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

function pathExists(content: string, path: string): boolean {
  return new RegExp(`^  ${escapeRegExp(path)}:\\s*$`, 'm').test(content);
}

function componentExists(content: string, componentName: string): boolean {
  return new RegExp(`^\\s{4}${escapeRegExp(componentName)}:\\s*$`, 'm').test(
    content,
  );
}

function pointerExists(file: string, pointer: string): boolean {
  const content = readFile(file);
  const [, section, subsection, rawName] = pointer.split('/');

  if (section === 'paths' && subsection) {
    return pathExists(content, decodePointerToken(subsection));
  }

  if (section === 'components' && rawName) {
    return componentExists(content, decodePointerToken(rawName));
  }

  return false;
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
  it('should resolve every local and external reference', () => {
    const unresolvedReferences = openAPIFiles
      .flatMap((file) => referencesFrom(file))
      .filter((reference) => {
        const target = referencedFile(reference);

        return !existsSync(target.file) || !pointerExists(target.file, target.pointer);
      })
      .map((reference) => `${reference.file}: ${reference.ref}`);

    expect(unresolvedReferences).toEqual([]);
  });
});
