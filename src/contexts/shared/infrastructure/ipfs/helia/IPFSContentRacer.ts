import { IPFSContentNotFoundError } from '../errors/IPFSContentNotFoundError';
import { IPFSNetwork } from '../networks/IPFSNetwork';
import { IPFSId } from './IPFSId';

export default class IPFSContentRacer {
  public async raceGetJSON<T>(
    networks: IPFSNetwork[],
    cid: IPFSId,
  ): Promise<T> {
    const controller = new AbortController();

    try {
      const result = await Promise.any(
        networks.map((network) => network.getJSON<T>(cid, controller.signal)),
      );

      controller.abort();

      return result;
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    }
  }

  public async raceGetRecord(
    networks: IPFSNetwork[],
    key: string,
  ): Promise<string | undefined> {
    const controller = new AbortController();

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
    }
  }
}
