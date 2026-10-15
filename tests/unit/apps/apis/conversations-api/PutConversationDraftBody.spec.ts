import { PutConversationDraftBody } from '@app/apps/apis/conversations-api/bodies/PutConversationDraftBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const failingProperties = async (
  plain: Record<string, unknown>,
): Promise<string[]> =>
  (await validate(plainToInstance(PutConversationDraftBody, plain))).map(
    (error) => error.property,
  );

describe('PutConversationDraftBody', () => {
  it('accepts a sealed draft up to the payload limit', async () => {
    expect(
      await failingProperties({
        encryptedPayload: 'a'.repeat(
          PutConversationDraftBody.ENCRYPTED_PAYLOAD_MAX_LENGTH,
        ),
        updatedAt: 1_700_000_000_000,
      }),
    ).toEqual([]);
  });

  it('rejects a sealed draft over the payload limit', async () => {
    expect(
      await failingProperties({
        encryptedPayload: 'a'.repeat(
          PutConversationDraftBody.ENCRYPTED_PAYLOAD_MAX_LENGTH + 1,
        ),
      }),
    ).toEqual(['encryptedPayload']);
  });
});
