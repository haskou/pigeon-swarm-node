import 'reflect-metadata';
import PigeonApplication from '@app/apps/PigeonApplication';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A node started with `CONTAINER_BUILD=true` regenerates
 * `config/container/services.yaml` from `src`, and a node without it boots from
 * that committed file. Regeneration must therefore reproduce the committed file
 * byte for byte, so a stale or hand-edited file fails here.
 */
describe('services.yaml generation', () => {
  const committedFile = path.resolve(
    process.cwd(),
    'config',
    'container',
    'services.yaml',
  );
  let outputDirectory: string;

  beforeAll(() => {
    outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'services-yaml-generation-'),
    );
  });

  afterAll(() => {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  });

  it('regenerates the committed file byte for byte', async () => {
    const regeneratedFile = path.join(outputDirectory, 'services.yaml');

    await new PigeonApplication().dependencyInjection({
      containerBuild: true,
      servicesYamlPath: regeneratedFile,
    });

    expect(fs.readFileSync(regeneratedFile, 'utf8')).toBe(
      fs.readFileSync(committedFile, 'utf8'),
    );
  }, 60_000);
});
