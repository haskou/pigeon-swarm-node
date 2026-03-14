import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/IPFSNetworkRegistry';
import { ShortId } from '@haskou/value-objects';

import { Node } from '../../domain/Node';
import { NodeRepository } from '../../domain/repositories/NodeRepository';

export default class LocalNodeRepository implements NodeRepository {
  constructor(private readonly networkRegistry: IPFSNetworkRegistry) {}

  // TODO: Implement final version of this method, this is a placeholder
  public loadLocalNode(): Promise<Node> {
    return Promise.resolve(
      Node.fromPrimitives({
        id: ShortId.generate().valueOf(),
        networks: Object.fromEntries(
          this.networkRegistry
            .getAll()
            .filter((network) => network.toPrimitives().key !== undefined)
            .map((network) => {
              const primitives = network.toPrimitives();

              return [
                primitives.name,
                {
                  key: primitives.key,
                  name: primitives.name,
                },
              ];
            }),
        ),
        owner: undefined,
      }),
    );
  }

  // TODO: Implement
  public saveLocalNode(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
