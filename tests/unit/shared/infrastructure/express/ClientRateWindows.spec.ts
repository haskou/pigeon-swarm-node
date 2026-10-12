import ClientRateWindows from '@app/shared/infrastructure/express/ClientRateWindows';

const MINUTE = 60_000;

describe('ClientRateWindows', () => {
  it('counts charges within a window and restarts the count after it', () => {
    const windows = new ClientRateWindows(MINUTE);

    expect(windows.charge('203.0.113.7', 0)).toBe(1);
    expect(windows.charge('203.0.113.7', 1)).toBe(2);
    expect(windows.charge('203.0.113.7', MINUTE)).toBe(1);
  });

  it('counts an IPv4-mapped IPv6 address against its IPv4 address', () => {
    const windows = new ClientRateWindows(MINUTE);

    windows.charge('::ffff:203.0.113.7', 0);

    expect(windows.charge('203.0.113.7', 0)).toBe(2);
  });

  it('buckets IPv6 addresses by /64 and keeps different /64s apart', () => {
    const windows = new ClientRateWindows(MINUTE);

    windows.charge('2001:db8:0:1::1', 0);

    expect(windows.charge('2001:db8:0:1:ffff:ffff:ffff:2', 0)).toBe(2);
    expect(windows.charge('2001:db8:0:2::1', 0)).toBe(1);
  });

  it('forgets expired windows once it tracks the maximum number of addresses', () => {
    const windows = new ClientRateWindows(MINUTE);

    for (let index = 0; index < 10_000; index += 1) {
      windows.charge(`10.0.${Math.floor(index / 256)}.${index % 256}`, 0);
    }

    expect(windows.size).toBe(10_000);

    windows.charge('198.51.100.1', MINUTE);

    expect(windows.size).toBe(1);
  });
});
