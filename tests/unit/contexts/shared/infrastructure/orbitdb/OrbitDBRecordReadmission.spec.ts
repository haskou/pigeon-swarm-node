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

  it('keeps one pending offer per key, the newest rejection', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const older = jest.fn(async () => false);
    const newer = jest.fn(async () => false);

    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: older,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(1_000);
    readmission.schedule({
      isCurrent: current,
      key: 'head',
      offer: newer,
      scope: 'network',
    });
    await jest.advanceTimersByTimeAsync(100_000);

    expect(older).not.toHaveBeenCalled();
    expect(newer).toHaveBeenCalledTimes(3);
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
});
