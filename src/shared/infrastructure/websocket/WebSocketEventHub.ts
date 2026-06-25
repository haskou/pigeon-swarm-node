import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { RawData, WebSocket } from 'ws';

import { ConversationCallEventRealtimeMapper } from './ConversationCallEventRealtimeMapper';
import { WebSocketClientMessage } from './WebSocketClientMessage';
import WebSocketClientMessageHandler from './WebSocketClientMessageHandler';
import { WebSocketRealtimeMessage } from './WebSocketRealtimeMessage';

const identityAttributeKeys = [
  'authorIdentityId',
  'creatorIdentityId',
  'deletedBy',
  'editedBy',
  'identityId',
  'inviteeIdentityId',
  'inviterIdentityId',
  'memberIds',
  'ownerIdentityId',
  'participantIds',
  'recipientIdentityId',
  'requesterIdentityId',
  'senderIdentityId',
  'author_id',
  'creator_id',
  'deleted_by',
  'edited_by',
  'identity_id',
  'invitee_id',
  'inviter_id',
  'member_ids',
  'owner_id',
  'participant_ids',
  'recipient_id',
  'requester_id',
  'sender_id',
];

export class WebSocketEventHub {
  private readonly conversationCallEventMapper =
    new ConversationCallEventRealtimeMapper();

  private clientMessageHandler?: WebSocketClientMessageHandler;

  private readonly clients = new Map<string, Set<WebSocket>>();

  private debug(message: string): void {
    Kernel.logger?.debug(message);
  }

  private broadcast(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): void {
    const recipients = this.getEventRecipients(event);
    const targetClients =
      recipients.size > 0
        ? [...recipients].map((recipient) => this.clients.get(recipient))
        : this.getNodeWideClients(event);
    const connectedRecipients = targetClients.filter(Boolean).length;

    this.debug(
      `WebSocket domain event "${event.eventName()}" aggregate="${event.aggregateId}" recipients="${[...recipients].join(',')}" connectedRecipients=${connectedRecipients}`,
    );

    for (const identityClients of targetClients) {
      if (!identityClients) {
        continue;
      }

      for (const client of identityClients) {
        this.send(client, message);
      }
    }
  }

  private getEventRecipients(event: DomainEvent): Set<string> {
    const recipients = new Set<string>();

    if (this.isCallSignalEvent(event)) {
      this.collectIdentityValues(
        event.attributes.recipientIdentityId,
        recipients,
      );

      return recipients;
    }

    for (const key of identityAttributeKeys) {
      this.collectIdentityValues(event.attributes[key], recipients);
    }

    if (this.isIdentityEvent(event) || this.isKeychainEvent(event)) {
      recipients.add(event.aggregateId);
    }

    return recipients;
  }

  private getNodeWideClients(event: DomainEvent): Array<Set<WebSocket>> {
    if (!this.isNodeWideEvent(event)) {
      return [];
    }

    return [...this.clients.values()];
  }

  private isIdentityEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('identities.');
  }

  private isIdentityUpdateEvent(event: DomainEvent): boolean {
    return event.eventName() === 'identities.v1.identity.was_updated';
  }

  private isKeychainEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('keychains.');
  }

  private isCallSignalEvent(event: DomainEvent): boolean {
    return event.eventName() === 'calls.v1.signal.sent';
  }

  private isNodeWideEvent(event: DomainEvent): boolean {
    return event.eventName().startsWith('nodes.');
  }

  private collectIdentityValues(value: unknown, recipients: Set<string>): void {
    if (typeof value === 'string' && value.length > 0) {
      recipients.add(value);

      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectIdentityValues(item, recipients);
      }
    }
  }

  private send(client: WebSocket, message: WebSocketRealtimeMessage): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify(message));
  }

  private handleClientMessage(
    identityId: string,
    client: WebSocket,
    rawMessage: RawData,
  ): void {
    const message = this.parseClientMessage(rawMessage);

    if (!message) {
      return;
    }

    if (message.type === 'typing') {
      this.relayTypingIndicator(identityId, message).catch((error: unknown) => {
        Kernel.logger?.error(
          `WebSocket typing indicator failed for "${identityId}": ${String(error)}`,
        );
      });

      return;
    }

    if (message.type !== 'identity_heartbeat') {
      return;
    }

    this.recordIdentityHeartbeat(identityId, Boolean(message.active)).catch(
      (error: unknown) => {
        Kernel.logger?.error(
          `WebSocket identity heartbeat failed for "${identityId}": ${String(error)}`,
        );
      },
    );
    this.send(client, {
      identityId,
      timestamp: Date.now(),
      type: 'heartbeat_ack',
    });
  }

  private async relayTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (message.scope === 'conversation') {
      await this.relayConversationTypingIndicator(identityId, message);

      return;
    }

    if (message.scope === 'community_channel') {
      await this.relayCommunityChannelTypingIndicator(identityId, message);
    }
  }

  private async relayConversationTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (typeof message.conversationId !== 'string') {
      return;
    }

    const recipients = await this.findConversationTypingRecipients(
      identityId,
      message.conversationId,
    );

    this.sendToRecipients(recipients, {
      active: Boolean(message.active),
      conversationId: message.conversationId,
      identityId,
      scope: 'conversation',
      timestamp: Date.now(),
      type: 'typing',
    });
  }

  private async relayCommunityChannelTypingIndicator(
    identityId: string,
    message: WebSocketClientMessage,
  ): Promise<void> {
    if (
      typeof message.communityId !== 'string' ||
      typeof message.channelId !== 'string'
    ) {
      return;
    }

    const recipients = await this.findCommunityChannelTypingRecipients(
      identityId,
      message.communityId,
      message.channelId,
    );

    this.sendToRecipients(recipients, {
      active: Boolean(message.active),
      channelId: message.channelId,
      communityId: message.communityId,
      identityId,
      scope: 'community_channel',
      timestamp: Date.now(),
      type: 'typing',
    });
  }

  private async findConversationTypingRecipients(
    identityId: string,
    conversationId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findConversationTypingRecipients(
        identityId,
        conversationId,
      )) || []
    );
  }

  private async findCommunityChannelTypingRecipients(
    identityId: string,
    communityId: string,
    channelId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findCommunityChannelTypingRecipients(
        identityId,
        communityId,
        channelId,
      )) || []
    );
  }

  private async relayIdentityUpdateToRelatedRecipients(
    event: DomainEvent,
    message: WebSocketRealtimeMessage,
  ): Promise<void> {
    if (!this.isIdentityUpdateEvent(event)) {
      return;
    }

    const baseRecipients = this.getEventRecipients(event);
    const relatedRecipients = await this.findIdentityUpdateRecipients(
      event.aggregateId,
    );
    const recipients = relatedRecipients.filter(
      (recipient) => !baseRecipients.has(recipient),
    );

    this.debug(
      `WebSocket identity update fanout "${event.aggregateId}" relatedRecipients="${recipients.join(',')}"`,
    );
    this.sendToRecipients(recipients, message);
  }

  private async findIdentityUpdateRecipients(
    identityId: string,
  ): Promise<string[]> {
    return (
      (await this.clientMessageHandler?.findIdentityUpdateRecipients(
        identityId,
      )) || []
    );
  }

  private sendToRecipients(
    recipients: string[],
    message: WebSocketRealtimeMessage,
  ): void {
    for (const recipient of recipients) {
      const recipientClients = this.clients.get(recipient);

      if (!recipientClients) {
        continue;
      }

      for (const recipientClient of recipientClients) {
        this.send(recipientClient, message);
      }
    }
  }

  private async recordIdentityHeartbeat(
    identityId: string,
    active: boolean,
  ): Promise<void> {
    await this.clientMessageHandler?.recordIdentityHeartbeat(
      identityId,
      active,
    );
  }

  private parseClientMessage(
    rawMessage: RawData,
  ): WebSocketClientMessage | undefined {
    try {
      const parsedMessage: unknown = JSON.parse(rawMessage.toString());

      if (!this.isRecord(parsedMessage)) {
        return undefined;
      }

      return this.toClientMessage(parsedMessage);
    } catch {
      return undefined;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toClientMessage(
    message: Record<string, unknown>,
  ): WebSocketClientMessage | undefined {
    if (message.type !== 'typing' && message.type !== 'identity_heartbeat') {
      return undefined;
    }

    return {
      active: typeof message.active === 'boolean' ? message.active : undefined,
      channelId:
        typeof message.channelId === 'string' ? message.channelId : undefined,
      communityId:
        typeof message.communityId === 'string'
          ? message.communityId
          : undefined,
      conversationId:
        typeof message.conversationId === 'string'
          ? message.conversationId
          : undefined,
      scope: typeof message.scope === 'string' ? message.scope : undefined,
      type: message.type,
    };
  }

  private unregister(identityId: string, client: WebSocket): void {
    const identityClients = this.clients.get(identityId);

    if (!identityClients) {
      return;
    }

    identityClients.delete(client);

    if (identityClients.size === 0) {
      this.clients.delete(identityId);
    }
  }

  public clear(): void {
    this.clients.clear();
  }

  public setClientMessageHandler(handler: WebSocketClientMessageHandler): void {
    this.clientMessageHandler = handler;
  }

  public publish(events: DomainEvent[]): void {
    for (const event of events) {
      const domainEventMessage: WebSocketRealtimeMessage = {
        event: JSON.parse(event.decode()),
        type: 'domain_event',
      };

      this.broadcast(event, domainEventMessage);
      this.relayIdentityUpdateToRelatedRecipients(
        event,
        domainEventMessage,
      ).catch((error: unknown) => {
        Kernel.logger?.error(
          `WebSocket identity update fanout failed for "${event.aggregateId}": ${String(error)}`,
        );
      });
      const conversationCallEvents =
        this.conversationCallEventMapper.toEvents(event);

      for (const conversationCallEvent of conversationCallEvents) {
        this.broadcast(event, {
          event: conversationCallEvent,
          type: 'domain_event',
        });
      }
    }
  }

  public register(identityId: IdentityId, client: WebSocket): void {
    const identityIdValue = identityId.valueOf();
    const identityClients = this.clients.get(identityIdValue) || new Set();

    identityClients.add(client);
    this.clients.set(identityIdValue, identityClients);
    this.debug(
      `WebSocket client registered for identity "${identityIdValue}" connections=${identityClients.size}`,
    );

    client.on('close', () => this.unregister(identityIdValue, client));
    client.on('error', () => this.unregister(identityIdValue, client));
    client.on('message', (message) =>
      this.handleClientMessage(identityIdValue, client, message),
    );
    this.send(client, {
      identityId: identityIdValue,
      type: 'connection_ack',
    });
  }
}

export const webSocketEventHub = new WebSocketEventHub();
