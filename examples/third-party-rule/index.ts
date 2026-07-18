import type { Finding, Rule, RuleContext } from '@openpreflight/core';
interface Config {
  requiredText: string;
}
export const headingRule: Rule<Config> = {
  id: 'dev.openpreflight.example.required-heading',
  version: '1.0.0',
  phases: ['comparison'],
  validateConfig(value: unknown): Config {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { requiredText?: unknown }).requiredText !== 'string'
    )
      throw new Error('requiredText is required');
    return value as Config;
  },
  async evaluate(context: RuleContext<Config>): Promise<readonly Finding[]> {
    return context.config.requiredText
      ? []
      : [
          {
            id: 'example-heading',
            ruleId: this.id,
            ruleVersion: this.version,
            title: 'Required heading missing',
            description: 'The configured heading was not observed.',
            severity: 'error',
            state: 'new',
            category: 'content',
            evidence: [],
          },
        ];
  },
};
