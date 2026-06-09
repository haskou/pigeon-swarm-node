import InfrastructureLogger from '@app/shared/infrastructure/logs/InfrastructureLogger';

import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private readonly bytesTimeoutMs: number;

  private readonly timeoutMs: number;

  constructor(timeoutMs?: number) {
    this.timeoutMs =
      timeoutMs ??
      Number(
        process.env.IPFS_CONTENT_TIMEOUT_MS ??
          (process.env.NODE_ENV === 'test' ? 500 : 3000),
      );
    this.bytesTimeoutMs = Number(
      process.env.IPFS_CONTENT_BYTES_TIMEOUT_MS ??
        process.env.IPFS_CONTENT_TIMEOUT_MS ??
        (process.env.NODE_ENV === 'test' ? 500 : 15000),
    );
  }

  private startTimeout(
    controller: AbortController,
    timeoutMs: number = this.timeoutMs,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => controller.abort(), timeoutMs);
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

  private logBytesFailure(
    network: IPFSNetwork,
    cid: IPFSId,
    error: unknown,
  ): void {
    if (process.env.DEBUG_NETWORK !== 'true') {
      return;
    }

    InfrastructureLogger.debug(
      `IPFS bytes fetch failed: cid="${cid.valueOf()}" networkId="${network.getId()}" networkName="${network.getName()}" networkType="${network.isPrivate() ? 'private' : 'public'}" error="${String(
        error,
      )}"`,
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
      throw new IPFSContentNotFoundError(cid.valueOf());
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
    const timeout = this.startTimeout(controller, this.bytesTimeoutMs);

    this.forwardAbortSignal(signal, controller);

    try {
      const result = await Promise.any(
        networks.map((network) =>
          network.getBytes(cid, controller.signal).catch((error) => {
            this.logBytesFailure(network, cid, error);

            throw error;
          }),
        ),
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
