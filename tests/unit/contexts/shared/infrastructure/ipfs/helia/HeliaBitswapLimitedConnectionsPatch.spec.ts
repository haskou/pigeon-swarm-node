import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(
  process.cwd(),
  'scripts/patch-helia-bitswap-limited-connections.js',
);
const files = [
  'node_modules/@helia/bitswap/dist/src/network.js',
  'node_modules/@helia/bitswap/src/network.ts',
];

/** The installed file as upstream ships it, without this repository's patch. */
const unpatched = (patched: string): string =>
  patched
    .replace(
      /\n\s*runOnLimitedConnection: this\.runOnLimitedConnections,(?=\n\s*signal: )/,
      '',
    )
    .replace(
      /\n\s*notifyOnLimitedConnection: this\.runOnLimitedConnections,/,
      '',
    );

describe('Helia bitswap limited connections dependency patch', () => {
  let root: string;

  const install = (content: (installed: string) => string): void => {
    for (const relativePath of files) {
      const target = path.join(root, relativePath);

      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(
        target,
        content(readFileSync(path.join(process.cwd(), relativePath), 'utf8')),
      );
    }
  };

  const contents = (): string[] =>
    files.map((relativePath) =>
      readFileSync(path.join(root, relativePath), 'utf8'),
    );

  const patch = (): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bitswap-patch-'));
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it('patches the upstream bitswap network into the installed one', () => {
    install(unpatched);

    expect(patch().status).toBe(0);
    expect(contents()).toEqual(
      files.map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), 'utf8'),
      ),
    );
  });

  it('leaves an already patched bitswap network unchanged when it runs again', () => {
    install(unpatched);
    patch();
    const patched = contents();

    const rerun = patch();

    expect(rerun.status).toBe(0);
    expect(rerun.stdout).toBe('');
    expect(contents()).toEqual(patched);
  });

  it('fails on a bitswap network it does not recognise', () => {
    const relativePath = files[0];
    const target = path.join(root, relativePath);

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'export class Network {}\n');

    const run = patch();

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`Unable to patch ${relativePath}`);
  });

  it('skips a bitswap network that is not installed', () => {
    expect(patch().status).toBe(0);
  });
});
