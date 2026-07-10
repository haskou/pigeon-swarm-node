import CallSignalDeliveryMaintenanceScheduler from '@app/apps/schedulers/CallSignalDeliveryMaintenanceScheduler';
import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import { mock } from 'jest-mock-extended';

describe('CallSignalDeliveryMaintenanceScheduler', () => {
  it('retries and expires signal deliveries every second', async () => {
    const retrier = mock<CallSignalDeliveryRetrier>();
    const expirationRegistrar = mock<CallSignalDeliveryExpirationRegistrar>();
    const scheduler = new CallSignalDeliveryMaintenanceScheduler(
      retrier,
      expirationRegistrar,
    );

    await scheduler.execute();

    expect(retrier.retry).toHaveBeenCalledTimes(1);
    expect(expirationRegistrar.expire).toHaveBeenCalledTimes(1);
    expect(scheduler.getCronExpression()).toEqual({ second: '*' });
    expect(scheduler.getProcessName()).toBe(
      'call-signal-delivery-maintenance',
    );
  });
});
