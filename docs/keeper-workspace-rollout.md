# Keeper workspace rollout

The Keeper route now opens the existing saved workspace directly. Task IDs and
IndexedDB schema are unchanged. Version-2 workspaces preserve intentionally empty
attachment lists; legacy workspaces can still recover original ZIP sources.
Keep original ZIP backups before clearing browser storage.

Local author checks and AI review share attached files and instructions. Reports
contain read-only findings and source identities, never corrected XML or publisher validation.
Changing sources or instructions invalidates author findings. AI cancellation stops
the browser request; a provider may already have started processing it.

Grant extraction requires a verified session and active subscription (or admin).
Its 10 requests/minute/account limit is per server instance. Configure a shared
platform rate limit for a fleet; this local guard is not a billing quota.

Merge only after CI passes. Deploy code and verify sign-in, paid access, worker
loading and provider settings in staging. Database migration deployment remains
separate. Keep production credentials out of local browser regression fixtures.

Workspace backups include manuscript text and conversation. Store them privately.
Import requires confirmation before replacing the active workspace. It allocates
fresh file identities, strips answer/approval metadata and marks imported chat as
unverified history, excluded from subsequent source-bound AI context.


The workspace follows the approved layout: article tasks and settings in a sidebar,
shared XML/PDF file cards, Summary/Findings/Queries/Activity views, and an adjacent
source evidence panel. On mobile, Tasks & settings expands the task controls and
Jump to source evidence moves focus to the stacked source panel. Findings combine
local author checks, recorded markup diagnostics, source limitations, and queries
without established responses. Counts describe observed records, not manuscript
completeness. Large lists and excerpts are paginated; reports include all observed
findings. No sample findings from the proposal are inserted into live tasks.
