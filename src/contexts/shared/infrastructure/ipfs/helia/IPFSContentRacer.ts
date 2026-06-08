import Kernel from '@app/Kernel';

import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { PublicIPFSContentFallback } from '../fallback/PublicIPFSContentFallback';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private readonly timeoutMs: number;

  constructor(
    timeoutMs?: number,
    private readonly fallback = new PublicIPFSContentFallback(),
  ) {
    this.timeoutMs =
      timeoutMs ??
      Number(
        process.env.IPFS_CONTENT_TIMEOUT_MS ??
          (process.env.NODE_ENV === 'test' ? 500 : 3000),
      );
  }

  private startTimeout(
    controller: AbortController,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => controller.abort(), this.timeoutMs);
  }

  private forwardAbortSignal(
    source: AbortSignal | undefined,
    target: AbortController,
  ): void {
    if (!source) {
      return;
    }

    if (source.aborted) {
      target.abort();

      return;
    }

    source.addEventListener('abort', () => target.abort(), { once: true });
  }

  private async fallbackAfterDirectLookup<T>(
    timeout: ReturnType<typeof setTimeout>,
    lookup: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    clearTimeout(timeout);
    const fallbackController = new AbortController();
    const fallbackTimeout = this.startTimeout(fallbackController);

    this.forwardAbortSignal(signal, fallbackController);

    try {
      return await lookup(fallbackController.signal);
    } finally {
      fallbackController.abort();
      clearTimeout(fallbackTimeout);
    }
  }

  private networkIdsForLog(networks: IPFSNetwork[]): string {
    return networks.map((network) => network.getId()).join(',');
  }

  private warnFallbackUsed(
    kind: 'bytes' | 'json',
    cid: IPFSId,
    networks: IPFSNetwork[],
  ): void {
    Kernel.logger.warn(
      `IPFS direct ${kind} lookup failed; fetched cid="${cid.valueOf()}" through content fallback networks="${this.networkIdsForLog(networks)}" timeoutMs=${this.timeoutMs}`,
    );
  }

  public async raceGetJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    this.forwardAbortSignal(signal, controller);

    try {
      const result = await Promise.any(
        networks.map((network) => network.getJSON<T>(cid, controller.signal)),
      );

      controller.abort();

      return result;
    } catch {
      const result = await this.fallbackAfterDirectLookup(
        timeout,
        (fallbackSignal) =>
          this.fallback.getJSON<T>(networks, cid, fallbackSignal),
        signal,
      );

      this.warnFallbackUsed('json', cid, networks);

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async raceGetBytes(
    networks: IPFSNetwork[],
    cid: IPFSId,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    this.forwardAbortSignal(signal, controller);

    try {
      const result = await Promise.any(
        networks.map((network) => network.getBytes(cid, controller.signal)),
      );

      controller.abort();

      return result;
    } catch {
      const result = await this.fallbackAfterDirectLookup(
        timeout,
        (fallbackSignal) =>
          this.fallback.getBytes(networks, cid, fallbackSignal),
        signal,
      );

      this.warnFallbackUsed('bytes', cid, networks);

      return result;
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
