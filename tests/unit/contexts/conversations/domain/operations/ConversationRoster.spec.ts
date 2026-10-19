import { ConversationRoster } from '@app/contexts/conversations/domain/operations/ConversationRoster';

describe('ConversationRoster', () => {
  it('keeps its members when the array it was built from is mutated afterwards', () => {
    const participants = ['alice', 'bob'];
    const roster = new ConversationRoster('conversation', 'network', 'alice', participants);

    participants.push('mallory');
    participants[0] = 'mallory';

    expect(roster.isMember('mallory')).toBe(false);
    expect(roster.isMember('alice')).toBe(true);
    expect(roster.getMembers()).toEqual(['alice', 'bob']);
  });

  it('gives callers a copy of its members that cannot change the roster', () => {
    const roster = new ConversationRoster('conversation', 'network', 'alice', ['alice', 'bob']);

    roster.getMembers().push('mallory');

    expect(roster.isMember('mallory')).toBe(false);
    expect(roster.getMembers()).toEqual(['alice', 'bob']);
  });
});
