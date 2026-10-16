import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';

import { NodeBlockSourcesResource } from '../resources/NodeBlockSourcesResource';
import { NodeBlockSourceViewModel } from './NodeBlockSourceViewModel';

export class NodeBlockSourcesViewModel {
  constructor(private readonly sources: NodeBlockSource[]) {}

  public toResource(): NodeBlockSourcesResource {
    return {
      sources: this.sources.map((source) =>
        new NodeBlockSourceViewModel(source).toResource(),
      ),
    };
  }
}
