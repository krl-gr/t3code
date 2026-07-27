import { describe, expect, it } from "vite-plus/test";

import {
  createExperimentalDynamicToolRegistry,
  DynamicToolRegistryError,
} from "./DynamicToolRegistry.ts";

const registration = (namespace: string) => ({
  spec: {
    type: "function" as const,
    namespace,
    name: "task_get",
    description: "Load one task.",
    inputSchema: { type: "object" },
  },
  execute: () => {
    throw new Error("not used");
  },
});

describe("ExperimentalDynamicToolRegistry", () => {
  it("accepts Responses API-compatible namespaces", () => {
    expect(() =>
      createExperimentalDynamicToolRegistry([
        {
          ownerId: "upcomputer.tasks",
          version: 1,
          tools: [registration("upcomputer_tasks")],
        },
      ]),
    ).not.toThrow();
  });

  it("rejects dotted dynamic-tool namespaces", () => {
    expect(() =>
      createExperimentalDynamicToolRegistry([
        {
          ownerId: "upcomputer.tasks",
          version: 1,
          tools: [registration("upcomputer.tasks")],
        },
      ]),
    ).toThrow(DynamicToolRegistryError);
  });
});
