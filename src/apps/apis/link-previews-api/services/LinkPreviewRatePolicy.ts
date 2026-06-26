import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

export { LinkPreviewRateBucket } from './rate-limits/LinkPreviewRateBucket';

export class LinkPreviewRatePolicy {
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 30;
  public static readonly WINDOW_MS = 60_000;

  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): LinkPreviewRatePolicy {
    const parsedLimit = environment.LINK_PREVIEW_RATE_LIMIT_PER_MINUTE;

    return new LinkPreviewRatePolicy(
      Number.isFinite(parsedLimit) && parsedLimit >= 0
        ? parsedLimit
        : LinkPreviewRatePolicy.DEFAULT_LIMIT_PER_MINUTE,
    );
  }

  constructor(private readonly limit: number) {}

  public getLimit(): number {
    return this.limit;
  }
}
