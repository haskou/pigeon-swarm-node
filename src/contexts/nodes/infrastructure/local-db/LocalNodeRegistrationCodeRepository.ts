import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import NodeRegistrationCodeRepository from '@app/contexts/nodes/domain/repositories/NodeRegistrationCodeRepository';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import { NodeRegistrationCodeHash } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeHash';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp } from '@haskou/value-objects';

import { LocalNodeRegistrationCodeDocument } from './documents/LocalNodeRegistrationCodeDocument';

export default class LocalNodeRegistrationCodeRepository extends NodeRegistrationCodeRepository {
  private static readonly NAMESPACE = 'node_registration_codes';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  // A use is read, spent and saved without any other code write in between,
  // through any handle on this database, so two requests cannot both spend
  // the last use.
  private async serialized<T>(action: () => Promise<T>): Promise<T> {
    return this.database.exclusively(
      LocalNodeRegistrationCodeRepository.NAMESPACE,
      action,
    );
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalNodeRegistrationCodeDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.expiresAt === 'number' &&
      typeof document.hash === 'string' &&
      typeof document.maxUses === 'number' &&
      typeof document.usesLeft === 'number'
    );
  }

  private toDocument(
    code: NodeRegistrationCode,
  ): LocalNodeRegistrationCodeDocument {
    const primitives = code.toPrimitives();

    return {
      _id: primitives.id,
      expiresAt: primitives.expiresAt,
      hash: primitives.hash,
      maxUses: primitives.maxUses,
      usesLeft: primitives.usesLeft,
    };
  }

  private toDomain(
    document: LocalNodeRegistrationCodeDocument,
  ): NodeRegistrationCode {
    return NodeRegistrationCode.fromPrimitives({
      expiresAt: document.expiresAt,
      hash: document.hash,
      id: document._id,
      maxUses: document.maxUses,
      usesLeft: document.usesLeft,
    });
  }

  private async persist(code: NodeRegistrationCode): Promise<void> {
    const document = this.toDocument(code);

    await this.database.save(
      LocalNodeRegistrationCodeRepository.NAMESPACE,
      document._id,
      document,
    );
  }

  private async findDocument(
    matcher: (document: LocalNodeRegistrationCodeDocument) => boolean,
  ): Promise<NodeRegistrationCode | undefined> {
    const [document] = await this.database.find(
      LocalNodeRegistrationCodeRepository.NAMESPACE,
      (candidate) => this.isDocument(candidate) && matcher(candidate),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async save(code: NodeRegistrationCode): Promise<void> {
    await this.serialized(() => this.persist(code));
  }

  public async findAll(): Promise<NodeRegistrationCode[]> {
    const documents = await this.database.find(
      LocalNodeRegistrationCodeRepository.NAMESPACE,
      (document) => this.isDocument(document),
    );

    return documents
      .filter((document) => this.isDocument(document))
      .map((document) => this.toDomain(document));
  }

  public async remove(id: NodeRegistrationCodeId): Promise<void> {
    await this.serialized(() =>
      this.database.delete(
        LocalNodeRegistrationCodeRepository.NAMESPACE,
        id.valueOf(),
      ),
    );
  }

  public async resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]> {
    return this.serialized(async () => {
      const { length } = await this.database.find(
        LocalNodeRegistrationCodeRepository.NAMESPACE,
      );

      if (length === 0) {
        return [];
      }

      await this.database.deleteMany(
        LocalNodeRegistrationCodeRepository.NAMESPACE,
        () => true,
      );

      return [ClearedNodeOwnerSetting.registrationCodes(length)];
    });
  }

  public async removeExpired(now: Timestamp): Promise<void> {
    await this.serialized(() =>
      this.database.deleteMany(
        LocalNodeRegistrationCodeRepository.NAMESPACE,
        (document) =>
          this.isDocument(document) && this.toDomain(document).isExpiredAt(now),
      ),
    );
  }

  public async reserveUse(
    hash: NodeRegistrationCodeHash,
    now: Timestamp,
  ): Promise<NodeRegistrationCode | undefined> {
    return this.serialized(async () => {
      const code = await this.findDocument(
        (document) => document.hash === hash.valueOf(),
      );

      if (!code?.isUsableAt(now)) {
        return undefined;
      }

      code.reserveUse(now);
      await this.persist(code);

      return code;
    });
  }

  public async releaseUse(id: NodeRegistrationCodeId): Promise<void> {
    await this.serialized(async () => {
      const code = await this.findDocument(
        (document) => document._id === id.valueOf(),
      );

      if (!code) {
        return;
      }

      code.releaseUse();
      await this.persist(code);
    });
  }
}
