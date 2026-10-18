import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Node } from '../Node';
import { NodeBlockEntries } from '../NodeBlockEntries';
import NodeBlockExceptionsRepository from '../repositories/NodeBlockExceptionsRepository';
import NodeBlockListRepository from '../repositories/NodeBlockListRepository';
import NodeBlockSourceRepository from '../repositories/NodeBlockSourceRepository';
import NodeBlockEnforcer from './NodeBlockEnforcer';
import NodeLoaderService from './NodeLoaderService';

/**
 * The single answer to "does this node block it?". It keeps the effective
 * entries in memory: the owner's own list, plus what each adopted source
 * applies minus the owner's local exceptions. An unclaimed node blocks
 * nobody and the current owner is never blocked, even if listed; this node's
 * own peer id is ignored by the enforcer. Identity ids that are not the
 * canonical encoding of a usable key are never enforced, wherever they were
 * stored. Every change to those inputs is stored under the node hold, then
 * applied through `reapply`, one at a time, before it resolves.
 */
export default class NodeBlockPolicy {
  private entries?: Promise<NodeBlockEntries>;
  private applying: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly listRepository: NodeBlockListRepository,
    private readonly sourceRepository: NodeBlockSourceRepository,
    private readonly exceptionsRepository: NodeBlockExceptionsRepository,
    private readonly nodeLoader: NodeLoaderService,
    private readonly enforcer: NodeBlockEnforcer,
  ) {}

  private async loadEntries(): Promise<NodeBlockEntries> {
    const [own, sources, exceptions] = await Promise.all([
      this.listRepository.findLocal(),
      this.sourceRepository.findAll(),
      this.exceptionsRepository.find(),
    ]);
    const adopted = sources
      .reduce(
        (entries, source) => entries.union(source.applied()),
        NodeBlockEntries.none(),
      )
      .without(exceptions);

    return NodeBlockEntries.of(own).union(adopted).canonical();
  }

  private currentEntries(): Promise<NodeBlockEntries> {
    if (!this.entries) {
      const loading = this.loadEntries();

      this.entries = loading;
      loading.catch(() => {
        if (this.entries === loading) {
          this.entries = undefined;
        }
      });
    }

    return this.entries;
  }

  private async enforce(entries: NodeBlockEntries, node: Node): Promise<void> {
    if (!node.hasOwner()) {
      await this.enforcer.enforce([], []);

      return;
    }

    await this.enforcer.enforce(
      entries
        .getIdentityIds()
        .filter((identityId) => !node.isOwnedBy(identityId)),
      entries.getNodePeerIds(),
    );
  }

  /** Reloads the stored inputs and applies them; run at startup and by `reapply`. */
  public async load(): Promise<void> {
    this.entries = undefined;

    await this.enforce(
      await this.currentEntries(),
      await this.nodeLoader.loadNode(),
    );
  }

  /**
   * Applies the stored inputs after a change made under the node hold. Runs
   * one application at a time, after every earlier one, and reads storage
   * fresh, so the last application enforces the last stored change.
   */
  public reapply(): Promise<void> {
    const applied = this.applying.then(() => this.load());

    this.applying = applied.catch((): void => undefined);

    return applied;
  }

  public async isIdentityBlocked(identityId: IdentityId): Promise<boolean> {
    const entries = await this.currentEntries();

    if (!entries.blocksIdentity(identityId)) {
      return false;
    }

    const node = await this.nodeLoader.loadNode();

    return node.hasOwner() && !node.isOwnedBy(identityId);
  }
}
