import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadContextBindingInput,
  DeleteProjectionThreadContextBindingsByThreadInput,
  GetProjectionThreadContextBindingInput,
  ListProjectionThreadContextBindingsInput,
  ProjectionThreadContextBinding,
  ProjectionThreadContextBindingRepository,
  type ProjectionThreadContextBindingRepositoryShape,
} from "../Services/ProjectionThreadContextBindings.ts";

const ProjectionThreadContextBindingDbRowSchema = ProjectionThreadContextBinding;

function toProjectionThreadContextBinding(
  row: Schema.Schema.Type<typeof ProjectionThreadContextBindingDbRowSchema>,
): ProjectionThreadContextBinding {
  return {
    bindingId: row.bindingId,
    threadId: row.threadId,
    sourceThreadId: row.sourceThreadId,
    sourceProjectId: row.sourceProjectId,
    sourceThreadTitle: row.sourceThreadTitle,
    mode: row.mode,
    cutoffMessageId: row.cutoffMessageId,
    snapshotText: row.snapshotText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const makeProjectionThreadContextBindingRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionThreadContextBindingRow = SqlSchema.void({
    Request: ProjectionThreadContextBinding,
    execute: (row) => {
      return sql`
        INSERT INTO projection_thread_context_bindings (
          binding_id,
          thread_id,
          source_thread_id,
          source_project_id,
          source_thread_title,
          mode,
          cutoff_message_id,
          snapshot_text,
          created_at,
          updated_at
        )
        VALUES (
          ${row.bindingId},
          ${row.threadId},
          ${row.sourceThreadId},
          ${row.sourceProjectId},
          ${row.sourceThreadTitle},
          ${row.mode},
          ${row.cutoffMessageId},
          ${row.snapshotText},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (binding_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          source_thread_id = excluded.source_thread_id,
          source_project_id = excluded.source_project_id,
          source_thread_title = excluded.source_thread_title,
          mode = excluded.mode,
          cutoff_message_id = excluded.cutoff_message_id,
          snapshot_text = excluded.snapshot_text,
          updated_at = excluded.updated_at
      `;
    },
  });

  const getProjectionThreadContextBindingRow = SqlSchema.findOneOption({
    Request: GetProjectionThreadContextBindingInput,
    Result: ProjectionThreadContextBindingDbRowSchema,
    execute: ({ bindingId }) =>
      sql`
        SELECT
          binding_id AS "bindingId",
          thread_id AS "threadId",
          source_thread_id AS "sourceThreadId",
          source_project_id AS "sourceProjectId",
          source_thread_title AS "sourceThreadTitle",
          mode,
          cutoff_message_id AS "cutoffMessageId",
          snapshot_text AS "snapshotText",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_context_bindings
        WHERE binding_id = ${bindingId}
        LIMIT 1
      `,
  });

  const listProjectionThreadContextBindingRows = SqlSchema.findAll({
    Request: ListProjectionThreadContextBindingsInput,
    Result: ProjectionThreadContextBindingDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          binding_id AS "bindingId",
          thread_id AS "threadId",
          source_thread_id AS "sourceThreadId",
          source_project_id AS "sourceProjectId",
          source_thread_title AS "sourceThreadTitle",
          mode,
          cutoff_message_id AS "cutoffMessageId",
          snapshot_text AS "snapshotText",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_context_bindings
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC, binding_id ASC
      `,
  });

  const deleteProjectionThreadContextBindingRow = SqlSchema.void({
    Request: DeleteProjectionThreadContextBindingInput,
    execute: ({ bindingId }) =>
      sql`
        DELETE FROM projection_thread_context_bindings
        WHERE binding_id = ${bindingId}
      `,
  });

  const deleteProjectionThreadContextBindingRowsByThread = SqlSchema.void({
    Request: DeleteProjectionThreadContextBindingsByThreadInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM projection_thread_context_bindings
        WHERE thread_id = ${threadId}
      `,
  });

  const upsert: ProjectionThreadContextBindingRepositoryShape["upsert"] = (row) =>
    upsertProjectionThreadContextBindingRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadContextBindingRepository.upsert:query"),
      ),
    );

  const getById: ProjectionThreadContextBindingRepositoryShape["getById"] = (input) =>
    getProjectionThreadContextBindingRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadContextBindingRepository.getById:query"),
      ),
      Effect.map(Option.map(toProjectionThreadContextBinding)),
    );

  const listByThreadId: ProjectionThreadContextBindingRepositoryShape["listByThreadId"] = (input) =>
    listProjectionThreadContextBindingRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadContextBindingRepository.listByThreadId:query"),
      ),
      Effect.map((rows) => rows.map(toProjectionThreadContextBinding)),
    );

  const deleteById: ProjectionThreadContextBindingRepositoryShape["deleteById"] = (input) =>
    deleteProjectionThreadContextBindingRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadContextBindingRepository.deleteById:query"),
      ),
    );

  const deleteByThreadId: ProjectionThreadContextBindingRepositoryShape["deleteByThreadId"] = (
    input,
  ) =>
    deleteProjectionThreadContextBindingRowsByThread(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadContextBindingRepository.deleteByThreadId:query"),
      ),
    );

  return {
    upsert,
    getById,
    listByThreadId,
    deleteById,
    deleteByThreadId,
  } satisfies ProjectionThreadContextBindingRepositoryShape;
});

export const ProjectionThreadContextBindingRepositoryLive = Layer.effect(
  ProjectionThreadContextBindingRepository,
  makeProjectionThreadContextBindingRepository,
);
