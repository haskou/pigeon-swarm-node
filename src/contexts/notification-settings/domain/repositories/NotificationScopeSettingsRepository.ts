import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationScopeSettings } from '../NotificationScopeSettings';
import { NotificationSettingScope } from '../value-objects/NotificationSettingScope';

export default abstract class NotificationScopeSettingsRepository {
  public abstract delete(
    identityId: IdentityId,
    scope: NotificationSettingScope,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<NotificationScopeSettings[]>;

  public abstract findByScope(
    identityId: IdentityId,
    scope: NotificationSettingScope,
  ): Promise<NotificationScopeSettings | undefined>;

  public abstract isPrivateScope(
    scope: NotificationSettingScope,
  ): Promise<boolean>;

  public abstract save(
    settings: NotificationScopeSettings,
    proof: PublicMutationProof,
  ): Promise<void>;
}
