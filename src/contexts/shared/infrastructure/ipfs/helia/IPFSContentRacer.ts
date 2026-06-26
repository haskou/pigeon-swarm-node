import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private static readonly DEFAULT_TIMEOUT_MS = 2500;
  private static readonly MAX_TIMEOUT_MS = 5000;

  private readonly timeoutMs: number;

  constructor() {
    const environment = pigeonEnvironment();

    this.timeoutMs = Math.min(
      environment.IPFS_CONTENT_TIMEOUT_MS ??
        (environment.NODE_ENV === 'test'
          ? 500
          : IPFSContentRacer.DEFAULT_TIMEOUT_MS),
      IPFSContentRacer.MAX_TIMEOUT_MS,
    );
  }

  private async withTimeout<T>(
    controller: AbortController,
    operation: Promise<T>,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutOperation = new Promise<T>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('IPFS operation timed out'));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutOperation]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  public async raceGetJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
  ): Promise<T> {
    const controller = new AbortController();

    try {
      const result = await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) => network.getJSON<T>(cid, controller.signal)),
        ),
      );

      controller.abort();

      return result;
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      controller.abort();
    }
  }

  public async raceGetBytes(
    networks: IPFSNetwork[],
    cid: IPFSId,
  ): Promise<Buffer> {
    const controller = new AbortController();

    try {
      const result = await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) => network.getBytes(cid, controller.signal)),
        ),
      );

      controller.abort();

      return result;
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      controller.abort();
    }
  }

  public async raceStat(networks: IPFSNetwork[], cid: IPFSId): Promise<void> {
    const controller = new AbortController();

    try {
      await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) =>
            network.stat(cid, false, controller.signal),
          ),
        ),
      );

      controller.abort();
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    } finally {
      controller.abort();
    }
  }

  public async raceGetRecord(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string | undefined> {
    const controller = new AbortController();

    try {
      const result = await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) =>
            network.getRecord(key, controller.signal).then((value) => {
              if (value === undefined) {
                throw new Error('Record not found in this network');
              }

              return value;
            }),
          ),
        ),
      );

      controller.abort();

      return result;
    } catch {
      return undefined;
    } finally {
      controller.abort();
    }
  }

  public async raceGetRecordCandidates(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string[]> {
    const controller = new AbortController();

    try {
      const results = await this.withTimeout(
        controller,
        Promise.allSettled(
          networks.map((network) => network.getRecord(key, controller.signal)),
        ),
      );

      return [
        ...new Set(
          results
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value)
            .filter((value) => value !== undefined),
        ),
      ];
    } catch {
      return [];
    } finally {
      controller.abort();
    }
  }
}
