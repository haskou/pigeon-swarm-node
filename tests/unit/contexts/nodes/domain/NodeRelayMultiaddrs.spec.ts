import { NodeRelayMultiaddr } from '@app/contexts/nodes/domain/value-objects/NodeRelayMultiaddr';
import { NodeRelayMultiaddrs } from '@app/contexts/nodes/domain/value-objects/NodeRelayMultiaddrs';

describe('NodeRelayMultiaddrs', () => {
  it('compares ordered multiaddresses through value object equality', () => {
    const multiaddrs = new NodeRelayMultiaddrs([
      new NodeRelayMultiaddr('/ip4/127.0.0.1/tcp/4001'),
      new NodeRelayMultiaddr('/ip4/127.0.0.1/tcp/4002'),
    ]);
    const equalMultiaddrs = NodeRelayMultiaddrs.fromPrimitives([
      '/ip4/127.0.0.1/tcp/4001',
      '/ip4/127.0.0.1/tcp/4002',
    ]);
    const reorderedMultiaddrs = NodeRelayMultiaddrs.fromPrimitives([
      '/ip4/127.0.0.1/tcp/4002',
      '/ip4/127.0.0.1/tcp/4001',
    ]);

    expect(multiaddrs.isEqual(equalMultiaddrs)).toBe(true);
    expect(multiaddrs.isEqual(reorderedMultiaddrs)).toBe(false);
  });
});
