# Runs

Runs follow the persisted lifecycle documented in the state-machine reference.
Every transition and job event is stored. Workers use leases and heartbeats;
abandoned jobs can be reclaimed within bounded attempts. Cancellation and global
deadlines are checked between stages and browser journeys.

`FAILED` means policy-relevant regressions, `ERROR` means infrastructure/update
execution failure, and `CANCELLED` means user cancellation. Cleanup runs before
all terminal states. Failed cleanup changes the result to `ERROR` and prints the
exact Docker project recovery command.

Update selectors accept WordPress metadata or legally supplied local packages.
Production credentials are never forwarded, and no source update is executed.
