import {
  MessageReadClaim,
  MessageReadProof,
} from '@app/contexts/conversations/domain/value-objects/MessageReadProof';

describe('MessageReadProof', () => {
  const now = Date.UTC(2026, 5, 10, 12);
  const day = 24 * 60 * 60 * 1000;

  function claimAt(timestamp: number): MessageReadClaim {
    return {
      conversationId: 'one-to-one:conversation-1',
      messageId: 'message-1',
      readerIdentityId: 'reader-1',
      timestamp,
    };
  }

  describe('isFresh', () => {
    it('accepts a receipt inside the freshness window so late offline delivery still works', () => {
      expect(MessageReadProof.isFresh(claimAt(now - 13 * day), now)).toBe(true);
    });

    it('rejects a receipt dated before the freshness window', () => {
      expect(
        MessageReadProof.isFresh(
          claimAt(now - MessageReadProof.MAX_AGE_MS - 1),
          now,
        ),
      ).toBe(false);
    });

    it('accepts a receipt dated at most the clock skew ahead of now', () => {
      expect(
        MessageReadProof.isFresh(
          claimAt(now + MessageReadProof.MAX_FUTURE_SKEW_MS),
          now,
        ),
      ).toBe(true);
    });

    it('rejects a receipt dated beyond the clock skew ahead of now', () => {
      expect(
        MessageReadProof.isFresh(
          claimAt(now + MessageReadProof.MAX_FUTURE_SKEW_MS + 1),
          now,
        ),
      ).toBe(false);
    });
  });
});
