import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "./sidebarProjectGrouping";
import type { Project } from "./types";

const environmentId = EnvironmentId.make("env-primary");
const repositoryIdentity = {
  canonicalKey: "github.com/pingdotgg/t3code",
  displayName: "pingdotgg/t3code",
  name: "t3code",
  rootPath: "/repo/t3code",
  locator: {
    source: "git-remote" as const,
    remoteName: "origin",
    remoteUrl: "https://github.com/pingdotgg/t3code.git",
  },
};

function makeProject(id: string, title: string, workspaceRoot: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId,
    title,
    workspaceRoot,
    repositoryIdentity,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5-codex",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("sidebar project grouping", () => {
  it("uses the repository presentation for a grouped subrepo", () => {
    const server = makeProject("project-server", "server", "/repo/t3code/server");
    const root = makeProject("project-root", "t3code", "/repo/t3code");

    const snapshots = buildSidebarProjectSnapshots({
      projects: [server, root],
      settings: {
        sidebarProjectGroupingMode: "repository",
        sidebarProjectGroupingOverrides: {},
      },
      primaryEnvironmentId: environmentId,
      resolveEnvironmentLabel: () => null,
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.projectKey).toBe(repositoryIdentity.canonicalKey);
    expect(snapshots[0]?.displayName).toBe("pingdotgg/t3code");
    expect(snapshots[0]?.memberProjects.map((project) => project.title)).toEqual([
      "server",
      "t3code",
    ]);
  });
});
