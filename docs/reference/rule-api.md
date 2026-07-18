# Rule API

A rule declares immutable ID/version, supported phases, validates its own config,
reads normalized baseline/candidate artifacts, and returns typed findings with
severity, evidence, remediation, and default policy. Evaluation must be
deterministic, bounded, side-effect free, and redact evidence before return.

```ts
interface Rule<T> {
  id: string;
  version: string;
  phases: ('baseline' | 'candidate' | 'comparison')[];
  validateConfig(value: unknown): T;
  evaluate(context: RuleContext<T>): Promise<readonly Finding[]>;
}
```

Third-party packages should export a factory and schema, use a globally unique
reverse-domain rule ID, test baseline/new/resolved/changed states, and never read
credentials or execute site code. See `examples/third-party-rule`.
