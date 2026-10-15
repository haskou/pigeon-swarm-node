import { InvalidConversationDraftKeyError } from '@app/contexts/conversations/domain/errors/InvalidConversationDraftKeyError';
import { ConversationDraftKey } from '@app/contexts/conversations/domain/value-objects/ConversationDraftKey';
import { createHmac } from 'crypto';

describe(ConversationDraftKey.name, () => {
  const opaqueKey = createHmac('sha256', 'owner-draft-key')
    .update('group:conversation')
    .digest('base64url');

  it('accepts a base64url HMAC-SHA256 digest', () => {
    expect(new ConversationDraftKey(opaqueKey).valueOf()).toBe(opaqueKey);
  });

  it.each([
    [
      'a group conversation id',
      'group:AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd',
    ],
    ['a one-to-one conversation id', `one-to-one:${'a'.repeat(64)}`],
    ['a padded base64 digest', `${opaqueKey.slice(0, 42)}=`],
    ['a short value', opaqueKey.slice(0, 42)],
    ['a long value', `${opaqueKey}A`],
    ['standard base64 characters', `${opaqueKey.slice(0, 42)}+`],
  ])('rejects %s', (_case, value) => {
    expect(() => new ConversationDraftKey(value)).toThrow(
      InvalidConversationDraftKeyError,
    );
  });
});
