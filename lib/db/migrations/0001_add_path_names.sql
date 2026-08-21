-- Adds the `path_names` column introduced by the collaborative editor (paths panel).
--
-- MUST run BEFORE deploying this branch. `getFlow` issues `db.select()`, which drizzle
-- expands into an explicit column list, so without this column every page load fails
-- with: ERROR 42703 column flows.path_names does not exist
--
-- Safe to re-run: IF NOT EXISTS plus a default means no rewrite of existing rows and no
-- downtime. Existing flows simply start with no custom path names.
alter table flows
  add column if not exists path_names jsonb not null default '{}'::jsonb;
