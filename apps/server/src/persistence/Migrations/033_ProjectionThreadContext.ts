import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Installs the thread-context projection for fresh databases while safely
 * adopting the same schema from legacy UpComputer databases.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_context_bindings (
      binding_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      source_thread_id TEXT NOT NULL,
      source_project_id TEXT,
      source_thread_title TEXT NOT NULL,
      mode TEXT NOT NULL,
      cutoff_message_id TEXT,
      snapshot_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_context_bindings_thread
    ON projection_thread_context_bindings(thread_id, created_at, binding_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_context_bindings_source
    ON projection_thread_context_bindings(source_thread_id)
  `;

  const projectionTurnColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_turns)
  `;
  if (!projectionTurnColumns.some((column) => column.name === "context_blocks_json")) {
    yield* sql`
      ALTER TABLE projection_turns
      ADD COLUMN context_blocks_json TEXT NOT NULL DEFAULT '[]'
    `;
  }
});
