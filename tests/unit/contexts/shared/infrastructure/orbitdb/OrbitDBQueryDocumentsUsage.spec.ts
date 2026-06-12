import fs from 'fs';
import path from 'path';

describe('OrbitDB queryDocuments usage', () => {
  const sourceRoot = path.join(process.cwd(), 'src');

  function sourceFilesFrom(directory: string): string[] {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return sourceFilesFrom(entryPath);
        }

        return entry.isFile() && entry.name.endsWith('.ts')
          ? [entryPath]
          : [];
      });
  }

  function callBodyFrom(source: string, startIndex: number): string {
    let depth = 0;

    for (let index = startIndex; index < source.length; index += 1) {
      const character = source[index];

      if (character === '(') {
        depth += 1;
      }

      if (character === ')') {
        depth -= 1;

        if (depth === 0) {
          return source.slice(startIndex, index + 1);
        }
      }
    }

    return source.slice(startIndex);
  }

  function lineNumberFor(source: string, index: number): number {
    return source.slice(0, index).split('\n').length;
  }

  it('requires explicit mode and operation for repository scans', () => {
    const offenders: string[] = [];

    for (const filePath of sourceFilesFrom(sourceRoot)) {
      if (filePath.endsWith('OrbitDBReplicatedStateRegistry.ts')) {
        continue;
      }

      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      const matches = source.matchAll(/queryDocuments\s*\(/g);

      for (const match of matches) {
        const index = match.index ?? 0;
        const callBody = callBodyFrom(source, index + match[0].length - 1);

        if (!callBody.includes('mode:') || !/\boperation\b/.test(callBody)) {
          offenders.push(`${relativePath}:${lineNumberFor(source, index)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
