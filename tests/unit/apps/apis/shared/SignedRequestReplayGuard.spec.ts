import { SignedRequestReplayGuard } from '@app/apps/apis/shared/SignedRequestReplayGuard';
import { SignedHttpRequestSignature } from '@haskou/pigeon-swarm-crypto';

describe('SignedRequestReplayGuard', () => {
  it('rejects a repeated signature for the same identity', () => {
    const guard = new SignedRequestReplayGuard();

    expect(guard.accept('identity', 'signature')).toBe(true);
    expect(guard.accept('identity', 'signature')).toBe(false);
  });

  it('keeps live entries and fails closed at capacity instead of evicting them', () => {
    const guard = new SignedRequestReplayGuard();

    guard.accept('victim', 'intercepted');
    Array.from({ length: 100_000 }).forEach((_, index) =>
      guard.accept('attacker', `signature-${index}`),
    );

    expect(guard.accept('victim', 'intercepted')).toBe(false);
    expect(guard.accept('attacker', 'one-more')).toBe(false);
  });

  it('accepts new signatures again once entries expire', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const guard = new SignedRequestReplayGuard();

    guard.accept('identity', 'signature');
    now.mockReturnValue(SignedHttpRequestSignature.REPLAY_WINDOW_MS + 1);

    expect(guard.accept('identity', 'signature')).toBe(true);

    now.mockRestore();
  });
});
