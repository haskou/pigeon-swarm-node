import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import ReplicatedStateNotReadyError from '../../orbitdb/ReplicatedStateNotReadyError';
import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private static readonly DEFAULT_TIMEOUT_MS = 2500;
  private static readonly MAX_TIMEOUT_MS = 5000;
  private static readonly RECORD_UNAVAILABLE_MESSAGE =
    'IPFS records are not reachable on every network yet. Retry shortly.';

  public static readonly CONTENT_UNAVAILABLE_MESSAGE =
    'IPFS content is not reachable on every network yet. Retry shortly.';

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

  private async raceFirst<T>(
    cid: IPFSId,
    networks: IPFSNetwork[],
    attempt: (network: IPFSNetwork, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let notFoundCount = 0;

    try {
      return await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) =>
            attempt(network, controller.signal).catch((error: unknown) => {
              if (error instanceof IPFSContentNotFoundError) {
                notFoundCount += 1;
              }

              throw error;
            }),
          ),
        ),
      );
    } catch {
      // Absence needs every attempted network to answer NotFound; one failure keeps it unknown.
      if (networks.length > 0 && notFoundCount === networks.length) {
        throw new IPFSContentNotFoundError(cid.valueOf());
      }

      throw new ReplicatedStateNotReadyError(
        IPFSContentRacer.CONTENT_UNAVAILABLE_MESSAGE,
      );
    } finally {
      controller.abort();
    }
  }

  public async raceGetJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
    maxBytes?: number,
  ): Promise<T> {
    return this.raceFirst(cid, networks, (network, signal) =>
      network.getJSON<T>(cid, signal, maxBytes),
    );
  }

  public async raceGetBytes(
    networks: IPFSNetwork[],
    cid: IPFSId,
    maxBytes?: number,
  ): Promise<Buffer> {
    return this.raceFirst(cid, networks, (network, signal) =>
      network.getBytes(cid, signal, maxBytes),
    );
  }

  public async raceStat(networks: IPFSNetwork[], cid: IPFSId): Promise<void> {
    return this.raceFirst(cid, networks, (network, signal) =>
      network.stat(cid, false, signal),
    );
  }

  public async raceGetRecord(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string | undefined> {
    const controller = new AbortController();
    const probe = { absent: 0 };

    try {
      return await this.withTimeout(
        controller,
        Promise.any(
          networks.map((network) =>
            network.getRecord(key, controller.signal).then((value) => {
              if (value === undefined) {
                probe.absent += 1;
                throw new Error('Record not found in this network');
              }

              return value;
            }),
          ),
        ),
      );
    } catch {
      if (networks.length > 0 && probe.absent === networks.length) {
        return undefined;
      }

      throw new ReplicatedStateNotReadyError(
        IPFSContentRacer.RECORD_UNAVAILABLE_MESSAGE,
      );
    } finally {
      controller.abort();
    }
  }

  public async raceGetRecordCandidates(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string[]> {
    if (networks.length === 0) {
      throw new ReplicatedStateNotReadyError(
        IPFSContentRacer.RECORD_UNAVAILABLE_MESSAGE,
      );
    }

    const controller = new AbortController();

    try {
      const records = await this.withTimeout(
        controller,
        Promise.all(
          networks.map((network) => network.getRecord(key, controller.signal)),
        ),
      );

      return [
        ...new Set(
          records.filter((value): value is string => value !== undefined),
        ),
      ];
    } catch {
      // A candidate list is complete only when every network answered: a
      // failed or timed-out network may hold the record, so fail closed.
      throw new ReplicatedStateNotReadyError(
        IPFSContentRacer.RECORD_UNAVAILABLE_MESSAGE,
      );
    } finally {
      controller.abort();
    }
  }
}
