import { MessagesViewModel } from '@app/apps/apis/conversations-api/view-model/MessagesViewModel';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { Poll } from '@app/contexts/polls/domain/Poll';

describe('MessagesViewModel', () => {
  it('keeps call events inside the message page window and limit', () => {
    const resource = new MessagesViewModel(
      'conversation-id',
      [
        message('message-1', 1000),
        message('message-2', 2000),
        message('message-3', 3000),
      ],
      [
        callEvent('old-call', 500),
        callEvent('inside-call', 2500),
        callEvent('new-call', 3500),
      ],
      [],
      3,
    ).toResource();

    expect(resource.messages.map((item) => item.id)).toEqual([
      'message-2',
      'inside-call',
      'message-3',
    ]);
    expect(resource.nextBeforeMessageId).toEqual('message-2');
    expect(JSON.stringify(resource.messages)).not.toContain('old-call');
    expect(JSON.stringify(resource.messages)).not.toContain('new-call');
  });

  it('returns polls inside the message list ordered by creation date', () => {
    const resource = new MessagesViewModel(
      'conversation-id',
      [message('message-1', 1000), message('message-2', 3000)],
      [],
      [poll('poll-1', 2000)],
      3,
    ).toResource();

    expect(resource.messages.map((item) => item.id)).toEqual([
      'message-1',
      'poll-1',
      'message-2',
    ]);
    expect(resource.messages[1].type).toEqual('poll');
  });

  it('uses poll messages as poll timeline items without duplicating them', () => {
    const resource = new MessagesViewModel(
      'conversation-id',
      [message('message-1', 1000), pollMessage('poll-1', 2000)],
      [],
      [poll('poll-1', 2000)],
      3,
    ).toResource();

    expect(resource.messages.map((item) => item.id)).toEqual([
      'message-1',
      'poll-1',
    ]);
    expect(resource.messages[1].type).toEqual('poll');
    expect(resource.nextBeforeMessageId).toEqual('message-1');
  });

  it('uses the oldest returned timeline message as pagination cursor when polls are first', () => {
    const resource = new MessagesViewModel(
      'conversation-id',
      [message('message-1', 2000), message('message-2', 3000)],
      [],
      [poll('poll-1', 1000)],
      3,
    ).toResource();

    expect(resource.messages.map((item) => item.id)).toEqual([
      'poll-1',
      'message-1',
      'message-2',
    ]);
    expect(resource.nextBeforeMessageId).toEqual('poll-1');
  });

  function callEvent(id: string, createdAt: number) {
    return {
      actorIdentityId: 'actor-id',
      callEventType: 'ended' as const,
      callId: id,
      conversationId: 'conversation-id',
      createdAt,
      durationMs: 100,
      id,
      type: 'call_event' as const,
    };
  }

  function message(id: string, createdAt: number): Message {
    return {
      getId: () => new MessageId(id),
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: 'conversation-id',
        createdAt,
        id,
        previousMessageIds: [] as string[],
        signature: 'signature',
        type: 'sent',
      }),
    } as unknown as Message;
  }

  function pollMessage(id: string, createdAt: number): Message {
    return {
      getId: () => new MessageId(id),
      toPrimitives: () => ({
        authorId: 'author-id',
        conversationId: 'conversation-id',
        createdAt,
        id,
        pollId: id,
        previousMessageIds: [] as string[],
        signature: 'signature',
        type: 'poll',
      }),
    } as unknown as Message;
  }

  function poll(id: string, createdAt: number): Poll {
    return {
      getId: () => new MessageId(id),
      toPrimitives: () => ({
        allowsMultipleVotes: false,
        createdAt,
        creatorIdentityId: 'creator-id',
        id,
        options: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
        ],
        question: 'Question?',
        scope: {
          conversationId: 'conversation-id',
          networkId: 'network-id',
          type: 'group_conversation',
        },
        status: 'open',
        votes: [] as Array<{
          createdAt: number;
          optionIds: string[];
          voterIdentityId: string;
        }>,
      }),
    } as unknown as Poll;
  }
});
