import { ShortLivedLookup } from '../../../../../src/contexts/public-mutations/infrastructure/ShortLivedLookup';

describe('ShortLivedLookup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces repeated lookups of a key within a second', async () => {
    const lookup = new ShortLivedLookup<number>();
    const load = jest.fn(() => Promise.resolve(1));

    await lookup.get('key', load);
    await lookup.get('key', load);
    expect(load).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_001);
    await lookup.get('key', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forgets a failed lookup so it is retried', async () => {
    const lookup = new ShortLivedLookup<number>();
    const load = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue(1);

    await expect(lookup.get('key', load)).rejects.toThrow('failed');
    await expect(lookup.get('key', load)).resolves.toBe(1);
  });

  it('drops expired entries, so distinct keys a peer offers over time do not accumulate', async () => {
    const lookup = new ShortLivedLookup<number>();
    // The map is private; exposing it only for this check would widen the API.
    const internals = lookup as unknown as { entries: Map<string, unknown> };

    for (let index = 0; index < 1_000; index += 1) {
      await lookup.get(`key-${index}`, () => Promise.resolve(index));
      jest.advanceTimersByTime(100);
    }

    expect(internals.entries.size).toBeLessThanOrEqual(30);
  });
});
