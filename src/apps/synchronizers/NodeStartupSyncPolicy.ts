import { NodeStartupSyncPolicyOptions } from './NodeStartupSyncPolicyOptions';

export default class NodeStartupSyncPolicy {
  private static readonly DEFAULT_MAX_CONTEXT_REQUESTS = 250;
  private static readonly DEFAULT_MAX_TOTAL_REQUESTS = 1000;
  private options: NodeStartupSyncPolicyOptions =
    NodeStartupSyncPolicy.optionsFromEnvironment();

  private static positiveIntegerFromEnv(
    variableName: string,
    fallback: number,
  ): number {
    const configured = process.env[variableName];

    if (configured === undefined) {
      return fallback;
    }

    const parsed = Number(configured);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private static optionsFromEnvironment(): NodeStartupSyncPolicyOptions {
    const defaultContextLimit = NodeStartupSyncPolicy.positiveIntegerFromEnv(
      'STARTUP_SYNC_MAX_CONTEXT_REQUESTS',
      NodeStartupSyncPolicy.DEFAULT_MAX_CONTEXT_REQUESTS,
    );

    return {
      maxCommunityRequests: NodeStartupSyncPolicy.positiveIntegerFromEnv(
        'STARTUP_SYNC_MAX_COMMUNITY_REQUESTS',
        defaultContextLimit,
      ),
      maxConversationRequests: NodeStartupSyncPolicy.positiveIntegerFromEnv(
        'STARTUP_SYNC_MAX_CONVERSATION_REQUESTS',
        defaultContextLimit,
      ),
      maxIdentityRequests: NodeStartupSyncPolicy.positiveIntegerFromEnv(
        'STARTUP_SYNC_MAX_IDENTITY_REQUESTS',
        defaultContextLimit,
      ),
      maxKeychainRequests: NodeStartupSyncPolicy.positiveIntegerFromEnv(
        'STARTUP_SYNC_MAX_KEYCHAIN_REQUESTS',
        defaultContextLimit,
      ),
      maxTotalRequests: NodeStartupSyncPolicy.positiveIntegerFromEnv(
        'STARTUP_SYNC_MAX_TOTAL_REQUESTS',
        NodeStartupSyncPolicy.DEFAULT_MAX_TOTAL_REQUESTS,
      ),
    };
  }

  public static fromOptions(
    options: NodeStartupSyncPolicyOptions,
  ): NodeStartupSyncPolicy {
    const policy = new NodeStartupSyncPolicy();

    policy.options = options;

    return policy;
  }

  private rotatingSlice<T>(items: T[], limit: number, attempt: number): T[] {
    if (items.length <= limit) {
      return items;
    }

    const start = (attempt * limit) % items.length;
    const rotatedItems = [...items.slice(start), ...items.slice(0, start)];

    return rotatedItems.slice(0, limit);
  }

  public limitCommunities<T>(communities: T[], attempt: number): T[] {
    return this.rotatingSlice(
      communities,
      this.options.maxCommunityRequests,
      attempt,
    );
  }

  public limitConversations<T>(conversations: T[], attempt: number): T[] {
    return this.rotatingSlice(
      conversations,
      this.options.maxConversationRequests,
      attempt,
    );
  }

  public limitIdentities<T>(identities: T[], attempt: number): T[] {
    return this.rotatingSlice(
      identities,
      this.options.maxIdentityRequests,
      attempt,
    );
  }

  public limitKeychains<T>(keychains: T[], attempt: number): T[] {
    return this.rotatingSlice(
      keychains,
      this.options.maxKeychainRequests,
      attempt,
    );
  }

  public limitTotal<T>(events: T[]): T[] {
    return events.slice(0, this.options.maxTotalRequests);
  }
}
