import { OrbitDBRecordReadmission } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRecordReadmission';

describe('OrbitDBRecordReadmission', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers a pending record once per wake however much state arrives', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => false);

    readmission.schedule(offer, () => true);
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

    readmission.schedule(offer, () => true);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(2_000);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(2_000);

    expect(offer).toHaveBeenCalledTimes(1);

    resolve(true);
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).toHaveBeenCalledTimes(1);
  });

  it('settles a record whose store is gone without offering it', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => false);

    readmission.schedule(offer, () => false);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).not.toHaveBeenCalled();
  });

  it('stops offering a record once an offer settles it', async () => {
    const readmission = new OrbitDBRecordReadmission();
    const offer = jest.fn(async () => true);

    readmission.schedule(offer, () => true);
    await jest.advanceTimersByTimeAsync(2_000);
    readmission.wake();
    await jest.advanceTimersByTimeAsync(100_000);

    expect(offer).toHaveBeenCalledTimes(1);
  });
});
