import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';

describe('SyncResponseSuppressionTracker', () => {
  let tracker: SyncResponseSuppressionTracker;

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = new SyncResponseSuppressionTracker();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow legacy sync responses without request id', async () => {
    await expect(
      tracker.shouldRespond('identity', 'identity-1', undefined),
    ).resolves.toBe(true);
  });

  it('should suppress a response when an equivalent response was already announced', async () => {
    const response = tracker.shouldRespond(
      'keychain',
      'identity-1',
      'request-1',
    );

    tracker.markAvailable('keychain', 'identity-1', 'request-1');
    jest.runAllTimers();

    await expect(response).resolves.toBe(false);
  });

  it('should allow only the first local responder for a request and resource', async () => {
    const firstResponse = tracker.shouldRespond(
      'conversation',
      'conversation-1',
      'request-1',
    );

    jest.runAllTimers();
    await expect(firstResponse).resolves.toBe(true);

    const secondResponse = tracker.shouldRespond(
      'conversation',
      'conversation-1',
      'request-1',
    );

    jest.runAllTimers();
    await expect(secondResponse).resolves.toBe(false);
  });
});
