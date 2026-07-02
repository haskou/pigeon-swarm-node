import { PrimitiveOf } from '@haskou/value-objects';

import type { NodeCallsRelayConfiguration } from './NodeCallsRelayConfiguration';
import type { NodePrivateRelayConfiguration } from './NodePrivateRelayConfiguration';
import type { NodePublicRelayConfiguration } from './NodePublicRelayConfiguration';
import type { NodeRelayConfiguration } from './NodeRelayConfiguration';

export type NodeRelayConfigurationInput = Partial<
  Omit<
    PrimitiveOf<NodeRelayConfiguration>,
    'callsRelay' | 'privateRelay' | 'publicRelay'
  >
> & {
  callsRelay?: Partial<PrimitiveOf<NodeCallsRelayConfiguration>>;
  privateRelay?: Partial<PrimitiveOf<NodePrivateRelayConfiguration>>;
  publicRelay?: Partial<PrimitiveOf<NodePublicRelayConfiguration>>;
};
