import { describe, expect, it } from "vite-plus/test";

import {
  CORE_WEB_PRODUCT_COMPOSITION,
  createExperimentalWebProductComposition,
  listExperimentalWebNavigation,
  listExperimentalWebRoutes,
} from "./WebComposition";
import { WebFeatureInvariantError } from "./WebFeature";

const loadRoute = async () => ({ default: () => null });

describe("web product composition", () => {
  it("uses an empty public composition by default", () => {
    expect(CORE_WEB_PRODUCT_COMPOSITION.features).toEqual([]);
    expect(listExperimentalWebRoutes(CORE_WEB_PRODUCT_COMPOSITION)).toEqual([]);
    expect(
      listExperimentalWebNavigation(CORE_WEB_PRODUCT_COMPOSITION, "primary-after-project"),
    ).toEqual([]);
  });

  it("sorts trusted route and navigation contributions deterministically", () => {
    const composition = createExperimentalWebProductComposition({
      features: [
        {
          id: "zeta",
          ownerId: "upcomputer.pro",
          version: 1,
          routes: [{ id: "tasks", path: "/tasks", load: loadRoute }],
          navigation: [
            {
              id: "tasks",
              label: "Tasks",
              path: "/tasks",
              slot: "primary-after-project",
              order: 20,
            },
          ],
        },
        {
          id: "alpha",
          ownerId: "upcomputer.pro",
          version: 1,
          routes: [{ id: "agents", path: "/agents", load: loadRoute }],
          navigation: [
            {
              id: "agents",
              label: "Agents",
              path: "/agents",
              slot: "primary-after-project",
              order: 10,
            },
          ],
        },
      ],
    });

    expect(composition.features.map((feature) => feature.id)).toEqual(["alpha", "zeta"]);
    expect(listExperimentalWebRoutes(composition).map(({ route }) => route.path)).toEqual([
      "/agents",
      "/tasks",
    ]);
    expect(
      listExperimentalWebNavigation(composition, "primary-after-project").map(
        ({ item }) => item.id,
      ),
    ).toEqual(["agents", "tasks"]);
  });

  it("fails closed for ambiguous route and navigation registrations", () => {
    expect(() =>
      createExperimentalWebProductComposition({
        features: [
          {
            id: "one",
            ownerId: "upcomputer.pro",
            version: 1,
            routes: [{ id: "tasks", path: "/tasks", load: loadRoute }],
          },
          {
            id: "two",
            ownerId: "upcomputer.pro",
            version: 1,
            routes: [{ id: "tasks", path: "/activity", load: loadRoute }],
          },
        ],
      }),
    ).toThrowError(WebFeatureInvariantError);

    expect(() =>
      createExperimentalWebProductComposition({
        features: [
          {
            id: "bad",
            ownerId: "upcomputer.pro",
            version: 1,
            navigation: [
              {
                id: "tasks",
                label: "Tasks",
                path: "/tasks",
                slot: "primary-after-project",
              },
              {
                id: "tasks",
                label: "Tasks",
                path: "/tasks",
                slot: "primary-after-project",
              },
            ],
          },
        ],
      }),
    ).toThrowError(WebFeatureInvariantError);
  });
});
