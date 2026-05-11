import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';

describe('MessageId', () => {
  it('should accept client-generated conversation scoped message ids', () => {
    const value =
      'one-to-one:75e1c7c2a058728e82a8bbb2bb2ed842c8fc6a8aa1f039efe0755d1a5d3461de:1778513696020:73702d3d-72f2-4269-8bb9-c4a6db5d80e5';

    expect(new MessageId(value).valueOf()).toBe(value);
  });

  it('should keep generating short ids for server-created messages', () => {
    expect(MessageId.generate().valueOf()).toHaveLength(24);
  });
});
