import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
import { CommunityOperationArguments } from './CommunityOperationArguments';
import { CommunityOperationLimits } from './CommunityOperationLimits';
import { CommunityOperationPrimitives } from './CommunityOperationPrimitives';

/**
 * One immutable, content-addressed change of a community. The community state
 * is never replicated: every node folds the verified operations that reach it,
 * so authority comes from the signed operation and its causal past only.
 */
export class CommunityOperation {
  private static readonly DIGEST = /^[A-Za-z0-9_-]{43}$/;
  private static readonly MAX_PARENTS = 64;

  public static readonly SCOPE_TYPE = 'community_operation';

  private readonly hash: string;

  private static assertExact(value: unknown): Record<string, unknown> {
    const fields = [
      'action',
      'args',
      'authorIdentityId',
      'communityId',
      'createdAt',
      'id',
      'networkId',
      'parents',
      'scopeType',
    ];

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidCommunityOperationError();
    }
    const record = value as Record<string, unknown>;

    if (
      Object.keys(record).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(record, field))
    ) {
      throw new InvalidCommunityOperationError();
    }

    return record;
  }

  private static text(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new InvalidCommunityOperationError();
    }

    return value;
  }

  private static args(value: unknown): CommunityOperationArguments {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidCommunityOperationError();
    }
    const args = value as CommunityOperationArguments;

    CommunityOperationLimits.assertArguments(args);

    return args;
  }

  private static parents(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length > CommunityOperation.MAX_PARENTS ||
      value.some(
        (parent) =>
          typeof parent !== 'string' || !CommunityOperation.DIGEST.test(parent),
      )
    ) {
      throw new InvalidCommunityOperationError();
    }
    const parents = value as string[];

    if (
      parents.some((parent, index) => index > 0 && parents[index - 1] >= parent)
    ) {
      throw new InvalidCommunityOperationError();
    }

    return parents;
  }

  private static contentOf(
    primitives: Omit<CommunityOperationPrimitives, 'id'>,
  ): Record<string, unknown> {
    return { ...primitives };
  }

  public static recordIdOf(communityId: string, hash: string): string {
    return `community:${communityId}:op:${hash}`;
  }

  public static create(attributes: {
    action: CommunityOperationAction;
    args: CommunityOperationArguments;
    authorIdentityId: IdentityId;
    communityId: CommunityId;
    createdAt: number;
    networkId: NetworkId;
    parents: string[];
  }): CommunityOperation {
    const content: Omit<CommunityOperationPrimitives, 'id'> = {
      action: attributes.action.valueOf(),
      args: attributes.args,
      authorIdentityId: attributes.authorIdentityId.valueOf(),
      communityId: attributes.communityId.valueOf(),
      createdAt: attributes.createdAt,
      networkId: attributes.networkId.valueOf(),
      parents: [...attributes.parents].sort(),
      scopeType: CommunityOperation.SCOPE_TYPE,
    };

    return CommunityOperation.fromPrimitives({
      ...content,
      id: CommunityOperation.recordIdOf(
        content.communityId,
        PublicMutationProof.digestOf(CommunityOperation.contentOf(content)),
      ),
    });
  }

  public static fromPrimitives(value: unknown): CommunityOperation {
    const record = CommunityOperation.assertExact(value);
    const primitives: CommunityOperationPrimitives = {
      action: CommunityOperation.text(record.action),
      args: CommunityOperation.args(record.args),
      authorIdentityId: CommunityOperation.text(record.authorIdentityId),
      communityId: CommunityOperation.text(record.communityId),
      createdAt: record.createdAt as number,
      id: CommunityOperation.text(record.id),
      networkId: CommunityOperation.text(record.networkId),
      parents: CommunityOperation.parents(record.parents),
      scopeType: record.scopeType as 'community_operation',
    };

    if (
      record.scopeType !== CommunityOperation.SCOPE_TYPE ||
      !Number.isSafeInteger(primitives.createdAt) ||
      primitives.createdAt < 0
    ) {
      throw new InvalidCommunityOperationError();
    }

    try {
      return new CommunityOperation(
        primitives,
        new CommunityOperationAction(primitives.action),
        new IdentityId(primitives.authorIdentityId),
        new CommunityId(primitives.communityId),
        new NetworkId(primitives.networkId),
      );
    } catch {
      throw new InvalidCommunityOperationError();
    }
  }

  private constructor(
    private readonly primitives: CommunityOperationPrimitives,
    private readonly action: CommunityOperationAction,
    private readonly authorIdentityId: IdentityId,
    private readonly communityId: CommunityId,
    private readonly networkId: NetworkId,
  ) {
    const { id, ...content } = primitives;

    this.hash = PublicMutationProof.digestOf(
      CommunityOperation.contentOf(content),
    );

    if (
      id !== CommunityOperation.recordIdOf(primitives.communityId, this.hash) ||
      action.isGenesis() !== (primitives.parents.length === 0) ||
      (action.isGenesis() &&
        (typeof primitives.args.nonce !== 'string' ||
          primitives.communityId !==
            CommunityId.derive(
              primitives.networkId,
              authorIdentityId.valueOf(),
              primitives.args.nonce,
            ).valueOf()))
    ) {
      throw new InvalidCommunityOperationError();
    }
  }

  public getAction(): CommunityOperationAction {
    return this.action;
  }

  public getArguments(): CommunityOperationArguments {
    return this.primitives.args;
  }

  public getAuthorIdentityId(): IdentityId {
    return this.authorIdentityId;
  }

  public getCommunityId(): CommunityId {
    return this.communityId;
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

  public toPrimitives(): CommunityOperationPrimitives {
    return structuredClone(this.primitives);
  }
}
