# CLI reference

Global flags are `--help`, `--version`, `--config FILE`, and `--json`. Commands:

```text
init, doctor, serve
source list|add|inspect
journey list|validate FILE
baseline create|list|delete ID
run [--source ID] [--updates all] [--update SELECTOR] [--journey ID]
run status ID, run cancel ID
report list|show ID|open ID|latest
cleanup [--older-than 7d|--all] [--yes]
config validate, version
```

Human output is default; JSON is stable for automation. Progress is suppressed
outside a TTY. Destructive cleanup previews targets unless `--yes` is supplied.
Errors state the stage, likely reason, evidence path, remedies, and safe logs.
