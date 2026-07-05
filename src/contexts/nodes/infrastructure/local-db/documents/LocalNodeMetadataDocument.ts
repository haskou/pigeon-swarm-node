import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import { PrimitiveOf } from '@haskou/value-objects';

export interface LocalNodeMetadataDocument extends Record<string, unknown> {
  _id: 'local';
  networks: Record<
    string,
    {
      id: string;
      key: string | undefined;
      name: string;
    }
  >;
  nodeId: string;
  owner?: string;
  relayConfiguration: PrimitiveOf<NodeRelayConfiguration>;
}
