# Data retention

Raw source archives default to deletion immediately after verified sanitized
import. Reports and failed artifacts default to 14 days. Containers and database
volumes are removed after every run. Credentials are never artifact content.

`openpreflight cleanup` previews expired artifacts; `--older-than 7d` changes the
cutoff and `--all --yes` removes all eligible data. Every resolved target must
remain beneath configured storage. Agent exports expire after 24 hours and the
runner requests earlier deletion after import.

Deletion removes filesystem references but cannot guarantee forensic secure
erasure on SSDs, copy-on-write filesystems, snapshots, backups, or host caches.
Use encrypted storage and destroy encryption keys for stronger lifecycle needs.
