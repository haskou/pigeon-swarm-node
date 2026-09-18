import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { startIsolatedNodes } from './two-node-call-privacy';
import { buildNodeRuntime, stopNode, waitFor } from './two-real-node-gossipsub';

async function main(): Promise<void> {
  const uiRoot = process.env.PIGEON_TEST_UI_ROOT;
  assert.ok(uiRoot, 'PIGEON_TEST_UI_ROOT is required');
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const suffix = `${process.pid}-${Date.now()}`;
  const nodes = [
    buildNodeRuntime(`browser-a-${suffix}`, 19380),
    buildNodeRuntime(`browser-b-${suffix}`, 19381),
  ];
  const children: ChildProcess[] = [];
  try {
    const key = generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString();
    await startIsolatedNodes(nodes, key);
    for (const [index, node] of nodes.entries()) {
      const child = spawn(
        process.execPath,
        [
          path.join(uiRoot, 'node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          String(19780 + index),
          '--strictPort',
        ],
        {
          cwd: uiRoot,
          env: {
            ...process.env,
            VITE_API_SERVER_URL: node.baseUrl,
            VITE_INDEPENDENT_CLIENT: 'false',
          },
          stdio: 'pipe',
        },
      );
      children.push(child);
      child.stderr?.on('data', (data) => process.stderr.write(String(data)));
      await waitFor(async () => {
        try {
          return (await fetch(`http://127.0.0.1:${19780 + index}`)).ok;
        } catch {
          return false;
        }
      }, 'Vite startup');
    }
    const browser = spawn(
      process.execPath,
      [path.join(__dirname, 'call-privacy-browser.mjs')],
      { env: process.env, stdio: 'inherit' },
    );
    children.push(browser);
    const exitCode = await new Promise((resolve) =>
      browser.once('exit', resolve),
    );
    assert.equal(exitCode, 0, 'Browser call privacy checks failed');
  } finally {
    for (const child of children)
      if (child.exitCode === null) child.kill('SIGTERM');
    await Promise.all(nodes.map(stopNode));
    await Promise.all(
      nodes.map((node) =>
        rm(path.dirname(node.ipfsPath), { recursive: true, force: true }),
      ),
    );
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
