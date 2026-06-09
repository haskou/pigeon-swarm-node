import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private static readonly MAX_TIMEOUT_MS = 10000;

  private readonly timeoutMs: number;

  constructor(timeoutMs?: number) {
    this.timeoutMs = Math.min(
      timeoutMs ??
        Number(
          process.env.IPFS_CONTENT_TIMEOUT_MS ??
            (process.env.NODE_ENV === 'test' ? 500 : 3000),
        ),
      IPFSContentRacer.MAX_TIMEOUT_MS,
    );
  }

  private startTimeout(
    controller: AbortController,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => controller.abort(), this.timeoutMs);
  }

  public async raceGetJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      const result = await Promise.any(
        networks.map((network) => network.getJSON<T>(cid, controller.signal)),
      );

      controller.abort();

      return result;
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      clearTimeout(timeout);
    }
  }

  public async raceGetBytes(
    networks: IPFSNetwork[],
    cid: IPFSId,
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      const result = await Promise.any(
        networks.map((network) => network.getBytes(cid, controller.signal)),
      );

      controller.abort();

      return result;
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      clearTimeout(timeout);
    }
  }

  public async raceStat(networks: IPFSNetwork[], cid: IPFSId): Promise<void> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      await Promise.any(
        networks.map((network) => network.stat(cid, false, controller.signal)),
      );

      controller.abort();
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }

      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      clearTimeout(timeout);
    }
  }

  public async raceGetRecord(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      const result = await Promise.any(
        networks.map((network) =>
          network.getRecord(key, controller.signal).then((value) => {
            if (value === undefined) {
              throw new Error('Record not found in this network');
            }

            return value;
          }),
        ),
      );

      controller.abort();

      return result;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async raceGetRecordCandidates(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string[]> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      const results = await Promise.allSettled(
        networks.map((network) => network.getRecord(key, controller.signal)),
      );

      return [
        ...new Set(
          results
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value)
            .filter((value) => value !== undefined),
        ),
      ];
    } finally {
      controller.abort();
      clearTimeout(timeout);
    }
  }
}
