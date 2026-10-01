import { WebSocketAdmissionLimiter } from '@app/shared/infrastructure/websocket/WebSocketAdmissionLimiter';

describe('WebSocketAdmissionLimiter', () => {
  it('refuses upgrades beyond the per-address budget until the window resets', () => {
    const limiter = new WebSocketAdmissionLimiter();
    const results = Array.from(
      { length: WebSocketAdmissionLimiter.UPGRADES_PER_ADDRESS + 1 },
      () => limiter.admit('10.0.0.1', 0, 1_000),
    );

    expect(results.slice(0, -1).every(Boolean)).toBe(true);
    expect(results.at(-1)).toBe(false);
    expect(limiter.admit('10.0.0.2', 0, 1_000)).toBe(true);
    expect(
      limiter.admit(
        '10.0.0.1',
        0,
        1_000 + WebSocketAdmissionLimiter.WINDOW_MS + 1,
      ),
    ).toBe(true);
  });

  it('refuses upgrades once the node holds the maximum number of sockets', () => {
    const limiter = new WebSocketAdmissionLimiter();

    expect(
      limiter.admit('10.0.0.1', WebSocketAdmissionLimiter.MAX_OPEN_SOCKETS),
    ).toBe(false);
  });
});
