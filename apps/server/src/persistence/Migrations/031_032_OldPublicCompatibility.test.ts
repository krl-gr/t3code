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
