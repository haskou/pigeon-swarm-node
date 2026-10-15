import { NodeRegistrationCodeLimitsFromEnvironment } from '@app/contexts/nodes/infrastructure/environment/NodeRegistrationCodeLimitsFromEnvironment';

describe('NodeRegistrationCodeLimitsFromEnvironment', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it('should default to 100 uses and 30 days', () => {
    delete process.env.NODE_REGISTRATION_CODE_MAX_USES;
    delete process.env.NODE_REGISTRATION_CODE_MAX_TTL_DAYS;

    const limits = NodeRegistrationCodeLimitsFromEnvironment.load();

    expect(limits.maxUses).toBe(100);
    expect(limits.maxTtlDays).toBe(30);
  });

  it('should read positive integers from the environment', () => {
    process.env.NODE_REGISTRATION_CODE_MAX_USES = '7';
    process.env.NODE_REGISTRATION_CODE_MAX_TTL_DAYS = '3';

    const limits = NodeRegistrationCodeLimitsFromEnvironment.load();

    expect(limits.maxUses).toBe(7);
    expect(limits.maxTtlDays).toBe(3);
  });

  it('should fall back to the defaults for invalid values', () => {
    process.env.NODE_REGISTRATION_CODE_MAX_USES = '0';
    process.env.NODE_REGISTRATION_CODE_MAX_TTL_DAYS = '-1';

    const limits = NodeRegistrationCodeLimitsFromEnvironment.load();

    expect(limits.maxUses).toBe(100);
    expect(limits.maxTtlDays).toBe(30);
  });
});
