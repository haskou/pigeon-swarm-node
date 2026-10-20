import { OrbitDBRecordReadmission } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRecordReadmission';

describe('OrbitDBRecordReadmission', () => {
  const current = (): boolean => true;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers a pending record once per wake however much state arrives', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => false);

    readmission.schedule({ isCurrent: current, offer, scope: 'network' });
    await jest.advanceTimersByTimeAsync(2_000);

    expect(offer).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 50; index++) readmission.wake();
    await jest.advanceTimersByTimeAsync(OrbitDBRecordReadmission.WAKE_DELAY_MS);

    expect(offer).toHaveBeenCalledTimes(2);

    readmission.wake();
    await jest.advanceTimersByTimeAsync(OrbitDBRecordReadmission.WAKE_DELAY_MS);

    expect(offer).toHaveBeenCalledTimes(3);
  });

  it('never runs two offers of the same record at once', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const offer = jest.fn(() => promise);

    readmission.schedule({ isCurrent: current, offer, scope: 'network' });
    readmission.wake();
    await jest.advanceTimersByTimeAsync(2_000);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(2_000);

    expect(offer).toHaveBeenCalledTimes(1);

    resolve(true);
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('offers the pending records of a wake one after the other', async () => {
    const readmission = new OrbitDBRecordReadmission();
    let running = 0;
    let mostRunning = 0;
    const offer = jest.fn(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();

      running += 1;
      mostRunning = Math.max(mostRunning, running);
      setTimeout(resolve, 100);
      await promise;
      running -= 1;

      return false;
    });

    for (let index = 0; index < 5; index++) {
      readmission.schedule({ isCurrent: current, offer, scope: 'network' });
    }
    // Past the first backoff attempt, which offers every record on its own.
    await jest.advanceTimersByTimeAsync(2_500);
    mostRunning = 0;
    readmission.wake();
    await jest.advanceTimersByTimeAsync(3_000);

    expect(offer).toHaveBeenCalledTimes(10);
    expect(mostRunning).toBe(1);
  });

  it('settles a record whose store is gone without offering it', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => false);

    readmission.schedule({ isCurrent: () => false, offer, scope: 'network' });
    readmission.wake();
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).not.toHaveBeenCalled();
  });

  it('stops offering a record once an offer settles it', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => true);

    readmission.schedule({ isCurrent: current, offer, scope: 'network' });
    await jest.advanceTimersByTimeAsync(2_000);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('schedules a record received again once, keeping its first wait', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const first = jest.fn(async () => false);
    const again = jest.fn(async () => false);

    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: first,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(1_000);
    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: again,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(71_000);

    expect(first).toHaveBeenCalledTimes(3);
    expect(again).not.toHaveBeenCalled();
  });

  it('keeps waking the other records while one offer never resolves', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const stalled = jest.fn(() => Promise.withResolvers<boolean>().promise);
    const offer = jest.fn(async () => false);

    readmission.schedule({ isCurrent: current, offer: stalled, scope: 'a' });
    readmission.schedule({ isCurrent: current, offer, scope: 'b' });
    await jest.advanceTimersByTimeAsync(2_500);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(
      OrbitDBRecordReadmission.WAKE_DELAY_MS + 100,
    );

    expect(stalled).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledTimes(2);
  });

  it('retires a record whose offer never resolves', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const stalled = jest.fn(() => Promise.withResolvers<boolean>().promise);
    const again = jest.fn(async () => true);

    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: stalled,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(100_000);
    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: again,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(2_000);

    expect(stalled).toHaveBeenCalledTimes(1);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('does not let the records of one scope take the place of another', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const flood = jest.fn(async () => false);
    const legitimate = jest.fn(async () => true);

    for (let index = 0; index < 300; index++) {
      readmission.schedule({ isCurrent: current, offer: flood, scope: 'a' });
    }
    readmission.schedule({ isCurrent: current, offer: legitimate, scope: 'b' });
    await jest.advanceTimersByTimeAsync(2_000);

    expect(flood).toHaveBeenCalledTimes(256);
    expect(legitimate).toHaveBeenCalledTimes(1);
  });

  it('tells whether a record of a subject waits to be offered again', async () => {
    const readmission = new OrbitDBRecordReadmission();
    let admitted = false;

    readmission.schedule({
      isCurrent: current,
      offer: () => Promise.resolve(admitted),
      scope: 'network',
      subject: 'calls:call:1',
    });

    expect(readmission.isPending('calls:call:1')).toBe(true);
    expect(readmission.isPending('calls:call:2')).toBe(false);

    admitted = true;
    await jest.advanceTimersByTimeAsync(2_000);

    expect(readmission.isPending('calls:call:1')).toBe(false);
  });

  it('keeps a subject pending while any of its records waits', async () => {
    const readmission = new OrbitDBRecordReadmission();

    readmission.schedule({
      isCurrent: current,
      offer: () => Promise.resolve(true),
      scope: 'network',
      subject: 'calls:call:1',
    });
    readmission.schedule({
      isCurrent: current,
      offer: () => Promise.resolve(false),
      scope: 'network',
      subject: 'calls:call:1',
    });
    await jest.advanceTimersByTimeAsync(2_000);

    expect(readmission.isPending('calls:call:1')).toBe(true);

    await jest.advanceTimersByTimeAsync(10_000 + 60_000);

    expect(readmission.isPending('calls:call:1')).toBe(false);
  });

  it('never holds a subject pending for a record past the bound', () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = (): Promise<boolean> => Promise.resolve(false);

    // The active bound and the queue behind it hold 512 records; the next is dropped.
    for (let index = 0; index < 512; index++) {
      readmission.schedule({ isCurrent: current, offer, scope: 'network' });
    }
    readmission.schedule({
      isCurrent: current,
      offer,
      scope: 'network',
      subject: 'calls:call:1',
    });

    expect(readmission.isPending('calls:call:1')).toBe(false);
  });

  const flood = (
    readmission: OrbitDBRecordReadmission,
    scope: object,
    offer: () => Promise<boolean>,
    reconcile?: () => Promise<void>,
  ): void => {
    for (let index = 0; index < 513; index++) {
      readmission.schedule({
        isCurrent: current,
        key: `record-${index}`,
        offer,
        reconcile,
        scope,
        subject: `store:${index}`,
      });
    }
  };

  it('queues the records past the active bound and drops past the queue', () => {
    const readmission = new OrbitDBRecordReadmission();
    const scope = {};

    flood(readmission, scope, async () => false);

    expect(readmission.isPending('store:255')).toBe(true);
    expect(readmission.isPending('store:511')).toBe(true);
    expect(readmission.isPending('store:512')).toBe(false);
    expect(readmission.isOverflowed(scope)).toBe(true);
  });

  it('tells the overflow of a scope only for the subjects it dropped', () => {
    const readmission = new OrbitDBRecordReadmission();
    const scope = {};

    flood(readmission, scope, async () => false);

    expect(readmission.isOverflowedFor(scope, 'store:512')).toBe(true);
    expect(readmission.isOverflowedFor(scope, 'store:1')).toBe(false);
    expect(readmission.isOverflowedFor({}, 'store:512')).toBe(false);
  });

  it('clears the overflow once the scope drained and was rescanned in full', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const scope = {};
    const offer = jest.fn(async () => true);
    const reconcile = jest.fn(async (): Promise<void> => undefined);

    flood(readmission, scope, offer, reconcile);

    expect(readmission.isOverflowed(scope)).toBe(true);

    await jest.advanceTimersByTimeAsync(
      OrbitDBRecordReadmission.DELAYS_MS[0] * 2,
    );

    expect(offer).toHaveBeenCalledTimes(512);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(readmission.isOverflowed(scope)).toBe(false);
  });

  it('retries the rescan of an overflowed scope until it completes', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const scope = {};
    let attempts = 0;
    const reconcile = jest.fn(async (): Promise<void> => {
      attempts += 1;

      if (attempts === 1) throw new Error('rescan failed');
    });

    flood(readmission, scope, async () => true, reconcile);

    await jest.advanceTimersByTimeAsync(4_000);

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(readmission.isOverflowed(scope)).toBe(true);

    await jest.advanceTimersByTimeAsync(60_000);

    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(readmission.isOverflowed(scope)).toBe(false);
  });
});
