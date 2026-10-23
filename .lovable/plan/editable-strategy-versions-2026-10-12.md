# Editable strategy versions
- Read Tab 1 exclusively from Lovable Cloud, keeping its current cards and styling.
- Add version metadata, older-version selection, inline editing, target dates and required change-note confirmation.
- Save atomically as a new version; cancel and unchanged drafts never write anything.
- Combine annotations and versions into the timeline, with an Add event form.
- Show real latest KPI values with period labels, or — when absent; show actionable load/save errors.

## Technical details
Use authenticated server functions and a transactional database function with concurrency checks to copy the latest version and apply only permitted edits. Keep baselines and KPI definitions immutable. Verify read paths, validation, edit/cancel behavior and existing-row counts without creating any strategy versions or annotations, including for tests.