# Container isolation

Each run uses a unique Compose project, private site network, database and
WordPress volumes, browser contexts, artifact directory, and bounded lifetime.
Containers enable `no-new-privileges`, drop capabilities, constrain pids/CPU/RAM,
use read-only filesystems and tmpfs where practical, and never mount host root or
the Docker socket. Only the control-plane worker accesses Docker.

The site network is `internal`; external access must traverse a dual-homed Squid
proxy that denies metadata/private ranges and permits configured update hosts.
WordPress HTTP blocking and the clone safety mu-plugin add defense in depth.
Mail is intercepted, production gateways/webhooks are disabled, and credentials
are absent. This does not eliminate kernel/container-escape risk; use a dedicated
host for hostile third-party code.
