import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "sidebar_visible")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN sidebar_visible INTEGER NOT NULL DEFAULT 1
    `;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_shell_visible_active
    ON projection_threads (
      sidebar_visible,
      deleted_at,
      archived_at,
      project_id,
      created_at,
      thread_id
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_shell_visible_archived
    ON projection_threads (
      sidebar_visible,
      deleted_at,
      archived_at,
      project_id,
      thread_id
    )
  `;
});
