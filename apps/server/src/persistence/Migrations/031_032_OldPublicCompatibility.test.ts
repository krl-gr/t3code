import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const sqliteMemoryLayer = Layer.mergeAll(NodeSqliteClient.layerMemory());

const selectMigration31And32 = Effect.fn("selectMigration31And32")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`
    SELECT migration_id, name
    FROM effect_sql_migrations
    WHERE migration_id IN (31, 32)
    ORDER BY migration_id
  `;
});

const hasContextBindingTable = Effect.fn("hasContextBindingTable")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'projection_thread_context_bindings'
  `;
  return tables.length > 0;
});

const hasProjectionTurnContextBlocksColumn = Effect.fn("hasProjectionTurnContextBlocksColumn")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_turns)
  `;
    return columns.some((column) => column.name === "context_blocks_json");
  },
);

const hasAuthProofKeyColumn = Effect.fn("hasAuthProofKeyColumn")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_pairing_links)
  `;
  return columns.some((column) => column.name === "proof_key_thumbprint");
});

const hasAuthScopesColumns = Effect.fn("hasAuthScopesColumns")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const pairingColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_pairing_links)
  `;
  const sessionColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_sessions)
  `;
  return (
    pairingColumns.some((column) => column.name === "scopes") &&
    sessionColumns.some((column) => column.name === "scopes")
  );
});

const installOldPublicMigration31And32 = Effect.fn("installOldPublicMigration31And32")(
  function* () {
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

    yield* sql`
    ALTER TABLE projection_turns
    ADD COLUMN context_blocks_json TEXT NOT NULL DEFAULT '[]'
  `;

    yield* sql`
    INSERT INTO effect_sql_migrations (migration_id, name)
    VALUES (31, 'ProjectionThreadContextBindings')
  `;

    yield* sql`
    INSERT INTO effect_sql_migrations (migration_id, name)
    VALUES (32, 'ProjectionTurnsContextBlocks')
  `;
  },
);

it.effect("leaves fresh databases on the current auth-only migration path", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 32 });

    assert.isFalse(yield* hasContextBindingTable());
    assert.isFalse(yield* hasProjectionTurnContextBlocksColumn());
    assert.isTrue(yield* hasAuthScopesColumns());
    assert.isTrue(yield* hasAuthProofKeyColumn());
    assert.deepStrictEqual(yield* selectMigration31And32(), [
      {
        migration_id: 31,
        name: "AuthAuthorizationScopes",
      },
      {
        migration_id: 32,
        name: "AuthPairingProofKeyThumbprint",
      },
    ]);
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);

it.effect("installs thread context schema after the auth compatibility range", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 33 });

    assert.isTrue(yield* hasContextBindingTable());
    assert.isTrue(yield* hasProjectionTurnContextBlocksColumn());
    assert.isTrue(yield* hasAuthScopesColumns());
    assert.isTrue(yield* hasAuthProofKeyColumn());
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);

it.effect("upgrades old public databases stopped before old context migrations", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 30 });
    yield* runMigrations({ toMigrationInclusive: 32 });

    assert.isTrue(yield* hasContextBindingTable());
    assert.isTrue(yield* hasProjectionTurnContextBlocksColumn());
    assert.isTrue(yield* hasAuthScopesColumns());
    assert.isTrue(yield* hasAuthProofKeyColumn());
    assert.deepStrictEqual(yield* selectMigration31And32(), [
      {
        migration_id: 31,
        name: "AuthAuthorizationScopes",
      },
      {
        migration_id: 32,
        name: "AuthPairingProofKeyThumbprint",
      },
    ]);
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);

it.effect("normalizes old public migration IDs before current auth migrations run", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* runMigrations({ toMigrationInclusive: 30 });
    yield* installOldPublicMigration31And32();
    yield* runMigrations({ toMigrationInclusive: 32 });

    assert.isTrue(yield* hasContextBindingTable());
    assert.isTrue(yield* hasProjectionTurnContextBlocksColumn());
    assert.isTrue(yield* hasAuthScopesColumns());
    assert.isTrue(yield* hasAuthProofKeyColumn());
    assert.deepStrictEqual(yield* selectMigration31And32(), [
      {
        migration_id: 31,
        name: "AuthAuthorizationScopes",
      },
      {
        migration_id: 32,
        name: "AuthPairingProofKeyThumbprint",
      },
    ]);

    const legacyHistory = yield* sql<{
      readonly legacy_migration_id: number;
      readonly legacy_name: string;
    }>`
      SELECT legacy_migration_id, legacy_name
      FROM old_public_migration_history
      ORDER BY legacy_migration_id
    `;
    assert.deepStrictEqual(legacyHistory, [
      {
        legacy_migration_id: 31,
        legacy_name: "ProjectionThreadContextBindings",
      },
      {
        legacy_migration_id: 32,
        legacy_name: "ProjectionTurnsContextBlocks",
      },
    ]);
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);

it.effect("repairs legacy orchestration-run IDs after a newer current migration was recorded", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* runMigrations({ toMigrationInclusive: 30 });
    yield* sql`
      CREATE TABLE projection_orchestration_runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      )
    `;
    yield* sql`
      INSERT INTO projection_orchestration_runs (run_id, status)
      VALUES ('preserved-run', 'complete')
    `;
    yield* sql`ALTER TABLE projection_threads ADD COLUMN snoozed_until TEXT`;
    yield* sql`ALTER TABLE projection_threads ADD COLUMN snoozed_at TEXT`;
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES
        (33, 'ProjectionOrchestrationRuns'),
        (34, 'ProjectionOrchestrationRunsDeliveries'),
        (35, 'ProjectionThreadsSnoozed')
    `;

    yield* runMigrations();

    const currentMigrations = yield* sql<{
      readonly migration_id: number;
      readonly name: string;
    }>`
      SELECT migration_id, name
      FROM effect_sql_migrations
      WHERE migration_id BETWEEN 31 AND 35
      ORDER BY migration_id
    `;
    assert.deepStrictEqual(currentMigrations, [
      { migration_id: 31, name: "AuthAuthorizationScopes" },
      { migration_id: 32, name: "AuthPairingProofKeyThumbprint" },
      { migration_id: 33, name: "ProjectionThreadContext" },
      { migration_id: 34, name: "ProjectionThreadsSettled" },
      { migration_id: 35, name: "ProjectionThreadsSnoozed" },
    ]);

    const projectionThreadColumns = yield* sql<{ readonly name: string }>`
      PRAGMA table_info(projection_threads)
    `;
    const projectionThreadColumnNames = new Set(
      projectionThreadColumns.map((column) => column.name),
    );
    for (const columnName of ["settled_override", "settled_at", "snoozed_until", "snoozed_at"]) {
      assert.isTrue(projectionThreadColumnNames.has(columnName));
    }

    const preservedRuns = yield* sql<{ readonly run_id: string; readonly status: string }>`
      SELECT run_id, status FROM projection_orchestration_runs
    `;
    assert.deepStrictEqual(preservedRuns, [{ run_id: "preserved-run", status: "complete" }]);

    const legacyHistory = yield* sql<{
      readonly legacy_migration_id: number;
      readonly legacy_name: string;
    }>`
      SELECT legacy_migration_id, legacy_name
      FROM old_public_migration_history
      WHERE legacy_migration_id IN (33, 34)
      ORDER BY legacy_migration_id
    `;
    assert.deepStrictEqual(legacyHistory, [
      { legacy_migration_id: 33, legacy_name: "ProjectionOrchestrationRuns" },
      { legacy_migration_id: 34, legacy_name: "ProjectionOrchestrationRunsDeliveries" },
    ]);
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);

it.effect("normalizes legacy Pro migrations that advanced past the upstream migration range", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* runMigrations({ toMigrationInclusive: 30 });
    yield* sql`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL)`;
    yield* sql`INSERT INTO tasks (id, title) VALUES ('preserved-task', 'Keep me')`;

    const legacyNames = [
      "Tasks",
      "TaskTriggers",
      "TaskAgentsCompatibility",
      "EnsureTaskTables",
      "ProjectionThreadProposedPlanProposal",
      "ProjectionThreadsSidebarVisibility",
    ] as const;
    for (const [index, name] of legacyNames.entries()) {
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (${index + 33}, ${name})
      `;
    }

    yield* runMigrations();

    assert.isTrue(yield* hasAuthScopesColumns());
    assert.isTrue(yield* hasAuthProofKeyColumn());
    assert.deepStrictEqual(yield* selectMigration31And32(), [
      { migration_id: 31, name: "AuthAuthorizationScopes" },
      { migration_id: 32, name: "AuthPairingProofKeyThumbprint" },
    ]);

    const current33 = yield* sql<{ readonly name: string }>`
      SELECT name FROM effect_sql_migrations WHERE migration_id = 33
    `;
    assert.deepStrictEqual(current33, [{ name: "ProjectionThreadContext" }]);

    const preservedTasks = yield* sql<{ readonly id: string; readonly title: string }>`
      SELECT id, title FROM tasks
    `;
    assert.deepStrictEqual(preservedTasks, [{ id: "preserved-task", title: "Keep me" }]);

    const legacyHistory = yield* sql<{
      readonly legacy_migration_id: number;
      readonly legacy_name: string;
    }>`
      SELECT legacy_migration_id, legacy_name
      FROM old_public_migration_history
      WHERE legacy_migration_id BETWEEN 33 AND 38
      ORDER BY legacy_migration_id
    `;
    assert.deepStrictEqual(
      legacyHistory,
      legacyNames.map((name, index) => ({ legacy_migration_id: index + 33, legacy_name: name })),
    );
  }).pipe(Effect.provide(sqliteMemoryLayer)),
);
