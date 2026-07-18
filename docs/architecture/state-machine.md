# Run state machine

Normal sequence is `QUEUED → PREPARING_SOURCE → VERIFYING_SOURCE →
CREATING_ENVIRONMENT → IMPORTING_SITE → SANITIZING_SITE → WARMING_BASELINE →
RUNNING_BASELINE → SNAPSHOTTING_BASELINE → RESTORING_CANDIDATE →
APPLYING_UPDATES → WARMING_CANDIDATE → RUNNING_CANDIDATE → COMPARING_RESULTS →
GENERATING_REPORT → CLEANING_UP → PASSED|FAILED`.

Any active stage may enter `CLEANING_UP` on cancellation/error; cleanup then
enters `CANCELLED` or `ERROR`. Terminal transitions are immutable. Every change
is a transaction that closes the previous stage and appends the new one. Worker
leases and deadlines are independent job state; exhausted attempts produce an
infrastructure error, never a regression failure.
