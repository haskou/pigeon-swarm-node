import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallParticipantLeaseWarmUp from '@app/contexts/calls/infrastructure/memory/CallParticipantLeaseWarmUp';
import { Timestamp } from '@haskou/value-objects';

describe('CallParticipantLeaseWarmUp', () => {
  const readyAt = 1_770_000_000_000;

  it('warms up until the node starts listening for participant leases', () => {
    const warmUp = new CallParticipantLeaseWarmUp();

    expect(warmUp.isWarmingUp(new Timestamp(readyAt))).toBe(true);
  });

  it('warms up for one heartbeat timeout after the node starts listening', () => {
    const warmUp = new CallParticipantLeaseWarmUp();

    warmUp.begin(new Timestamp(readyAt));

    expect(
      warmUp.isWarmingUp(
        new Timestamp(readyAt + CallParticipantLease.HEARTBEAT_TIMEOUT_MS - 1),
      ),
    ).toBe(true);
    expect(
      warmUp.isWarmingUp(
        new Timestamp(readyAt + CallParticipantLease.HEARTBEAT_TIMEOUT_MS),
      ),
    ).toBe(false);
  });

  it('keeps the first listening instant when it begins again', () => {
    const warmUp = new CallParticipantLeaseWarmUp();

    warmUp.begin(new Timestamp(readyAt));
    warmUp.begin(
      new Timestamp(readyAt + CallParticipantLease.HEARTBEAT_TIMEOUT_MS),
    );

    expect(
      warmUp.isWarmingUp(
        new Timestamp(readyAt + CallParticipantLease.HEARTBEAT_TIMEOUT_MS),
      ),
    ).toBe(false);
  });
});
