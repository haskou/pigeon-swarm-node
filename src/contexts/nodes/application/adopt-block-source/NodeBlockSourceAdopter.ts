import { NodeBlockSource } from '../../domain/NodeBlockSource';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockSourceAdopterMessage } from './messages/NodeBlockSourceAdopterMessage';

/**
 * Adopts another owner's published list, pinned to that owner's identity, or
 * changes where it is fetched from and whether additions apply on their own.
 * The list is fetched by the refresher; nothing applies before the first one.
 */
export default class NodeBlockSourceAdopter {
  constructor(
    private readonly repository: NodeBlockSourceRepository,
    private readonly policy: NodeBlockPolicy,
  ) {}

  private async adoptOrReconfigure(
    message: NodeBlockSourceAdopterMessage,
  ): Promise<NodeBlockSource> {
    if (!(await this.repository.exists(message.ownerIdentityId))) {
      const adopted = NodeBlockSource.adopt(
        message.ownerIdentityId,
        message.origin,
        message.autoApply,
      );

      await this.repository.save(adopted);

      return adopted;
    }

    const source = await this.repository.find(message.ownerIdentityId);

    source.reconfigure(message.origin, message.autoApply);
    await this.repository.save(source);

    return source;
  }

  public async adopt(
    message: NodeBlockSourceAdopterMessage,
  ): Promise<NodeBlockSource> {
    return this.policy.change(() => this.adoptOrReconfigure(message));
  }
}
