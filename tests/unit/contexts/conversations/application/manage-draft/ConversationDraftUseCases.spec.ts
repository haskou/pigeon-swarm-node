import ConversationDraftDeleter from '@app/contexts/conversations/application/manage-draft/ConversationDraftDeleter';
import ConversationDraftSaver from '@app/contexts/conversations/application/manage-draft/ConversationDraftSaver';
import ConversationDraftsFinder from '@app/contexts/conversations/application/manage-draft/ConversationDraftsFinder';
import { ConversationDraftDeleteMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftDeleteMessage';
import { ConversationDraftSaveMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftSaveMessage';
import { ConversationDraftsFindMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftsFindMessage';
import LocalConversationDraftRepository from '@app/contexts/conversations/infrastructure/local-db/LocalConversationDraftRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { createHmac } from 'crypto';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

const ownerIdentityId =
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
const otherIdentityId =
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';

function draftKey(seed: string): string {
  return createHmac('sha256', 'owner-draft-key')
    .update(seed)
    .digest('base64url');
}

describe('Conversation draft use cases', () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let previousDatabasePath: string | undefined;
  let saver: ConversationDraftSaver;
  let finder: ConversationDraftsFinder;
  let deleter: ConversationDraftDeleter;

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-conversation-drafts-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    const repository = new LocalConversationDraftRepository(database);
    saver = new ConversationDraftSaver(repository);
    finder = new ConversationDraftsFinder(repository);
    deleter = new ConversationDraftDeleter(repository);
  });

  afterEach(async () => {
    await database.close();

    if (previousDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousDatabasePath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  async function draftsOf(identityId: string) {
    const drafts = await finder.find(
      new ConversationDraftsFindMessage(identityId),
    );

    return drafts.map((draft) => ({
      draftKey: draft.getDraftKey().valueOf(),
      encryptedPayload: draft.getEncryptedPayload().valueOf(),
      updatedAt: draft.getUpdatedAt().valueOf(),
    }));
  }

  it('stores a draft under its opaque key without a conversation id', async () => {
    const key = draftKey('group:conversation');

    await saver.save(
      new ConversationDraftSaveMessage(ownerIdentityId, key, 'sealed', 1_000),
    );

    expect(await draftsOf(ownerIdentityId)).toEqual([
      { draftKey: key, encryptedPayload: 'sealed', updatedAt: 1_000 },
    ]);
    const documents = await database.find('conversation_drafts');
    expect(documents).toHaveLength(1);
    expect(Object.keys(documents[0]).sort()).toEqual([
      '_id',
      'draftKey',
      'encryptedPayload',
      'identityId',
      'updatedAt',
    ]);
    expect(JSON.stringify(documents)).not.toContain('group:conversation');
  });

  it('replaces the draft saved under the same key', async () => {
    const key = draftKey('group:conversation');

    await saver.save(
      new ConversationDraftSaveMessage(ownerIdentityId, key, 'first', 1_000),
    );
    await saver.save(
      new ConversationDraftSaveMessage(ownerIdentityId, key, 'second', 2_000),
    );

    expect(await draftsOf(ownerIdentityId)).toEqual([
      { draftKey: key, encryptedPayload: 'second', updatedAt: 2_000 },
    ]);
  });

  it('keeps drafts private to the identity that saved them', async () => {
    const key = draftKey('group:conversation');

    await saver.save(
      new ConversationDraftSaveMessage(ownerIdentityId, key, 'sealed', 1_000),
    );
    await deleter.delete(
      new ConversationDraftDeleteMessage(otherIdentityId, key),
    );

    expect(await draftsOf(otherIdentityId)).toEqual([]);
    expect(await draftsOf(ownerIdentityId)).toHaveLength(1);

    await deleter.delete(
      new ConversationDraftDeleteMessage(ownerIdentityId, key),
    );

    expect(await draftsOf(ownerIdentityId)).toEqual([]);
  });

  it('keeps only the most recently updated drafts of an identity', async () => {
    const limit = ConversationDraftSaver.MAX_DRAFTS_PER_IDENTITY;

    for (let index = 0; index <= limit; index += 1) {
      await saver.save(
        new ConversationDraftSaveMessage(
          ownerIdentityId,
          draftKey(`conversation-${index}`),
          `sealed-${index}`,
          1_000 + index,
        ),
      );
    }
    await saver.save(
      new ConversationDraftSaveMessage(
        otherIdentityId,
        draftKey('other'),
        'other',
        1,
      ),
    );

    const drafts = await draftsOf(ownerIdentityId);

    expect(drafts).toHaveLength(limit);
    expect(drafts[0].draftKey).toBe(draftKey(`conversation-${limit}`));
    expect(drafts.map((draft) => draft.draftKey)).not.toContain(
      draftKey('conversation-0'),
    );
    expect(await draftsOf(otherIdentityId)).toHaveLength(1);
  });
});
