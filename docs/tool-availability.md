# Tool availability — 2026-10-30

- Formula Studio Pro is a main dashboard tool at `/formulaEditor`. The previous `/formulaEditorExp` URL redirects there. Its persisted tool ID remains `formulaEditorExp` so existing access keys, grants, pins, and usage history remain compatible. Registry classification, settings, documentation, and admin labels identify it as an established tool.
- Highlights Gen is removed from the dashboard, tool registry, active tool enum, settings listings, admin choices, and tool documentation. `/highlightsGen` redirects to the dashboard. Existing database/history records are not rewritten.
- The entire Keeper page and its header button are disabled, as confirmed by the operator. `/keeper` redirects to the dashboard. The application no longer imports/mounts the Keeper page through a public route. Source modules and existing stored data are retained.

`tests/tool-availability.mjs` renders the actual dashboard, experimental list and header with inert service boundaries, exercises the actual route/access-control elements under React Router, and checks registry classification and legacy-key compatibility. It does not contact the database or test a deployed site.

Formula Studio retains its CE 5.7 validation/export checks. This availability change does not validate an article or perform editorial/graphics/layout work.
