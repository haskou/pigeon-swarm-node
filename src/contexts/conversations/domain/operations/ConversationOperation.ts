import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationId } from '../value-objects/ConversationId';
import { ConversationOperationAction } from '../value-objects/ConversationOperationAction';
import { ConversationOperationArguments } from './ConversationOperationArguments';
import { ConversationOperationLimits } from './ConversationOperationLimits';
import { ConversationOperationPrimitives } from './ConversationOperationPrimitives';

/**
 * One immutable, content-addressed change of a conversation. The roster of a
 * conversation is never replicated: every node folds the verified operations
 * that reach it, so authority comes from the signed operation and its causal
 * past only. A 1:1 conversation is a log made of its genesis alone.
 */
export class ConversationOperation {
  private static readonly DIGEST = /^[A-Za-z0-9_-]{43}$/;
  private static readonly MAX_PARENTS = 64;

  public static readonly SCOPE_TYPE = 'conversation_operation';

  private readonly hash: string;

  private static assertExact(value: unknown): Record<string, unknown> {
    const fields = [
      'action',
      'args',
      'authorIdentityId',
      'conversationId',
      'createdAt',
      'id',
      'networkId',
      'parents',
      'scopeType',
    ];

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidConversationOperationError();
    }
    const record = value as Record<string, unknown>;

    if (
      Object.keys(record).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(record, field))
    ) {
      throw new InvalidConversationOperationError();
    }

    return record;
  }

  private static text(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidConversationOperationError();
    }

    return value;
  }

  private static args(value: unknown): ConversationOperationArguments {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidConversationOperationError();
    }
    const args = value as ConversationOperationArguments;

    ConversationOperationLimits.assertArguments(args);

    return args;
  }

  private static parents(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length > ConversationOperation.MAX_PARENTS ||
      value.some(
        (parent) =>
          typeof parent !== 'string' ||
          !ConversationOperation.DIGEST.test(parent),
      )
    ) {
      throw new InvalidConversationOperationError();
    }
    const parents = value as string[];

    if (
      parents.some((parent, index) => index > 0 && parents[index - 1] >= parent)
    ) {
      throw new InvalidConversationOperationError();
    }

    return parents;
  }

  private static contentOf(
    primitives: Omit<ConversationOperationPrimitives, 'id'>,
  ): Record<string, unknown> {
    return { ...primitives };
  }

  /**
   * The only id a genesis may carry: a group id commits to its creator and
   * nonce, a 1:1 id to its two participants, so an id cannot be claimed by
   * someone else's genesis.
   */
  private static genesisConversationIdOf(
    primitives: ConversationOperationPrimitives,
  ): string {
    const { args } = primitives;

    if (args.type === 'group' && typeof args.nonce === 'string') {
      return ConversationId.deriveGroup(
        primitives.networkId,
        primitives.authorIdentityId,
        args.nonce,
      ).valueOf();
    }

    if (
      args.type === 'one-to-one' &&
      Array.isArray(args.participantIds) &&
      args.participantIds.length === 2 &&
      args.participantIds.every((id) => typeof id === 'string')
    ) {
      return ConversationId.deterministic(
        args.participantIds[0],
        args.participantIds[1],
        primitives.networkId,
      ).valueOf();
    }

    throw new InvalidConversationOperationError();
  }

  public static recordIdOf(conversationId: string, hash: string): string {
    return `conversation:${conversationId}:op:${hash}`;
  }

  public static create(attributes: {
    action: ConversationOperationAction;
    args: ConversationOperationArguments;
    authorIdentityId: IdentityId;
    conversationId: ConversationId;
    createdAt: number;
    networkId: NetworkId;
    parents: string[];
  }): ConversationOperation {
    const content: Omit<ConversationOperationPrimitives, 'id'> = {
      action: attributes.action.valueOf(),
      args: attributes.args,
      authorIdentityId: attributes.authorIdentityId.valueOf(),
      conversationId: attributes.conversationId.valueOf(),
      createdAt: attributes.createdAt,
      networkId: attributes.networkId.valueOf(),
      parents: [...attributes.parents].sort(),
      scopeType: ConversationOperation.SCOPE_TYPE,
    };

    return ConversationOperation.fromPrimitives({
      ...content,
      id: ConversationOperation.recordIdOf(
        content.conversationId,
        PublicMutationProof.digestOf(ConversationOperation.contentOf(content)),
      ),
    });
  }

  public static fromPrimitives(value: unknown): ConversationOperation {
    const record = ConversationOperation.assertExact(value);
    const primitives: ConversationOperationPrimitives = {
      action: ConversationOperation.text(record.action),
      args: ConversationOperation.args(record.args),
      authorIdentityId: ConversationOperation.text(record.authorIdentityId),
      conversationId: ConversationOperation.text(record.conversationId),
      createdAt: record.createdAt as number,
      id: ConversationOperation.text(record.id),
      networkId: ConversationOperation.text(record.networkId),
      parents: ConversationOperation.parents(record.parents),
      scopeType: record.scopeType as 'conversation_operation',
    };

    if (
      record.scopeType !== ConversationOperation.SCOPE_TYPE ||
      !Number.isSafeInteger(primitives.createdAt) ||
      primitives.createdAt < 0
    ) {
      throw new InvalidConversationOperationError();
    }

    try {
      return new ConversationOperation(
        primitives,
        new ConversationOperationAction(primitives.action),
        new IdentityId(primitives.authorIdentityId),
        new ConversationId(primitives.conversationId),
        new NetworkId(primitives.networkId),
      );
    } catch {
      throw new InvalidConversationOperationError();
    }
  }

  private constructor(
    private readonly primitives: ConversationOperationPrimitives,
    private readonly action: ConversationOperationAction,
    private readonly authorIdentityId: IdentityId,
    private readonly conversationId: ConversationId,
    private readonly networkId: NetworkId,
  ) {
    const { id, ...content } = primitives;

    this.hash = PublicMutationProof.digestOf(
      ConversationOperation.contentOf(content),
    );

    if (
      id !==
        ConversationOperation.recordIdOf(
          primitives.conversationId,
          this.hash,
        ) ||
      action.isGenesis() !== (primitives.parents.length === 0) ||
      (action.isGenesis() &&
        primitives.conversationId !==
          ConversationOperation.genesisConversationIdOf(primitives))
    ) {
      throw new InvalidConversationOperationError();
    }
  }

  public getAction(): ConversationOperationAction {
    return this.action;
  }

  public getArguments(): ConversationOperationArguments {
    return this.primitives.args;
  }

  public getAuthorIdentityId(): IdentityId {
    return this.authorIdentityId;
  }

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getCreatedAt(): number {
    return this.primitives.createdAt;
  }

  public getHash(): string {
    return this.hash;
  }

  public getId(): string {
    return this.primitives.id;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getParents(): string[] {
    return [...this.primitives.parents];
  }

  public isGenesis(): boolean {
    return this.action.isGenesis();
  }

  public toPrimitives(): ConversationOperationPrimitives {
    return structuredClone(this.primitives);
  }
}
