import { OrbitDBNotificationHeadMutationGate } from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationHeadMutationGate';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { mock, MockProxy } from 'jest-mock-extended';

describe('OrbitDBNotificationHeadMutationGate', () => {
  let publicGate: MockProxy<PublicMutationGate>;
  let gate: OrbitDBNotificationHeadMutationGate;

  beforeEach(() => {
    publicGate = mock<PublicMutationGate>();
    gate = new OrbitDBNotificationHeadMutationGate(publicGate);
  });

  it('governs notification and recipient index heads only', () => {
    expect(gate.governsHead('notification:abc')).toBe(true);
    expect(gate.governsHead('notification-recipient-index:abc')).toBe(true);
    expect(gate.governsHead('conversation:abc')).toBe(false);
  });

  it('admits a head that is the admitted record of its own id', async () => {
    publicGate.accepts.mockResolvedValue(true);

    await expect(
      gate.acceptsHead('notification:abc', { id: 'abc' }),
    ).resolves.toBe(true);
    expect(publicGate.accepts).toHaveBeenCalledWith('notifications', {
      id: 'abc',
    });
  });

  it('refuses a head whose key does not match the record id', async () => {
    publicGate.accepts.mockResolvedValue(true);

    await expect(
      gate.acceptsHead('notification:other', { id: 'abc' }),
    ).resolves.toBe(false);
  });

  it('refuses a record the public gate refuses', async () => {
    publicGate.accepts.mockResolvedValue(false);

    await expect(
      gate.acceptsHead('notification:abc', { id: 'abc' }),
    ).resolves.toBe(false);
  });

  it('refuses every recipient index head', async () => {
    publicGate.accepts.mockResolvedValue(true);

    await expect(
      gate.acceptsHead('notification-recipient-index:abc', { id: 'abc' }),
    ).resolves.toBe(false);
  });

  it('ignores heads it does not govern', async () => {
    await expect(
      gate.acceptsHead('conversation:abc', { id: 'abc' }),
    ).resolves.toBe(true);
    expect(publicGate.accepts).not.toHaveBeenCalled();
  });
});
