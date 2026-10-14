import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationMother } from '../../../mothers/ConversationMother';

describe('Conversation', () => {
  let author: IdentityId;
  let recipient: IdentityId;
  let outsider: IdentityId;
  let mother: ConversationMother;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    author = mother.author;
    recipient = mother.recipient;
    outsider = await ConversationMother.generateIdentityId();
  });

  it('should expose only roster metadata, never messages', () => {
    const primitives = mother.buildGroup().toPrimitives();

    expect(Object.keys(primitives).sort()).toEqual([
      'adminIds',
      'creatorId',
      'id',
      'name',
      'networkId',
      'participantIds',
      'type',
    ]);
  });

  it('should know its participants', () => {
    const conversation = mother.build();

    expect(conversation.hasParticipant(author)).toBe(true);
    expect(conversation.hasParticipant(recipient)).toBe(true);
    expect(conversation.hasParticipant(outsider)).toBe(false);
  });

  it('should round-trip its primitives', () => {
    const group = mother.buildGroup();

    expect(
      Conversation.fromPrimitives(group.toPrimitives()).toPrimitives(),
    ).toEqual(group.toPrimitives());
  });
});
