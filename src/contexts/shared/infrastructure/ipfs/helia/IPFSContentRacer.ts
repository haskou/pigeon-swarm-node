import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  private readonly TIMEOUT_MS = 3000;

  private startTimeout(
    controller: AbortController,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => controller.abort(), this.TIMEOUT_MS);
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

  public async raceStat(networks: IPFSNetwork[], cid: IPFSId): Promise<void> {
    const controller = new AbortController();
    const timeout = this.startTimeout(controller);

    try {
      await Promise.any(networks.map((network) => network.stat(cid, false)));

      controller.abort();
    } catch {
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
}
