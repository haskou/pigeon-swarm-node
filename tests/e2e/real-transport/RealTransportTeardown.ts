import { rm } from 'node:fs/promises';

type Stoppable = { stop(): Promise<unknown> };

export type TeardownNode = {
  name: string;
  helia: Stoppable;
  orbitdb?: Stoppable;
  registry?: { clear(): void };
};

const STOP_TIMEOUT_MILLISECONDS = 15_000;

async function stopWithin(label: string, stop: Stoppable): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      stop.stop(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`did not stop within ${STOP_TIMEOUT_MILLISECONDS} ms`),
            ),
          STOP_TIMEOUT_MILLISECONDS,
        );
      }),
    ]);

    return true;
  } catch (error) {
    console.error(
      `Teardown failure: ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );

    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function stopNode(node: TeardownNode): Promise<boolean> {
  node.registry?.clear();
  const orbitdb = node.orbitdb
    ? await stopWithin(`${node.name} OrbitDB`, node.orbitdb)
    : true;
  const helia = await stopWithin(`${node.name} Helia`, node.helia);

  return orbitdb && helia;
}

/**
 * Stops every node (each stop bounded), removes the fixture directory and ends
 * the process explicitly. A resource that outlives its owner can therefore
 * never keep a script alive: it is reported by type and the exit code stays
 * the script verdict (any teardown failure turns a pass into a failure).
 */
export async function teardownAndExit(
  nodes: readonly TeardownNode[],
  root: string | undefined,
): Promise<never> {
  const stopped = await Promise.all(nodes.map(stopNode));
  let removed = true;

  if (root) {
    try {
      await rm(root, { force: true, recursive: true });
    } catch (error) {
      removed = false;
      console.error(
        `Teardown failure: fixture directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const leaked = process
    .getActiveResourcesInfo()
    .filter((type) => !['TTYWrap', 'PipeWrap', 'FSReqCallback'].includes(type));

  if (leaked.length > 0)
    console.error(
      `Resources still keeping the event loop alive after teardown (forcing exit): ${leaked.join(', ')}`,
    );

  process.exit(stopped.every(Boolean) && removed ? (process.exitCode ?? 0) : 1);
}
