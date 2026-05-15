export class RoutePrefix {
  private readonly value: string;

  public static fromEnvironment(value: string | undefined): RoutePrefix {
    return new RoutePrefix(value);
  }

  constructor(value: string | undefined) {
    if (!value || value === '/') {
      this.value = '';

      return;
    }

    const normalizedPrefix = value
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

    this.value = normalizedPrefix ? `/${normalizedPrefix}` : '';
  }

  public includes(requestPath: string): boolean {
    return (
      this.value.length > 0 &&
      (requestPath === this.value || requestPath.startsWith(`${this.value}/`))
    );
  }

  public isEmpty(): boolean {
    return this.value.length === 0;
  }

  public toString(): string {
    return this.value;
  }
}
