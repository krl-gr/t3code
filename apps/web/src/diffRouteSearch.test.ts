import { TurnId } from "@t3tools/contracts";
import { retainSearchParams, stripSearchParams } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  type DiffRouteSearch,
  diffRouteSearchForNavigation,
  parseDiffRouteSearch,
} from "./diffRouteSearch";

describe("parseDiffRouteSearch", () => {
  it("parses valid diff search values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats numeric and boolean diff toggles as open", () => {
    expect(
      parseDiffRouteSearch({
        diff: 1,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
    });

    expect(
      parseDiffRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
    });
  });

  it("drops turn and file values when diff is closed", () => {
    const parsed = parseDiffRouteSearch({
      diff: "0",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({});
  });

  it("drops file value when turn is not selected", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      diff: "1",
    });
  });

  it("normalizes whitespace-only values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "  ",
      diffFilePath: "  ",
    });

    expect(parsed).toEqual({
      diff: "1",
    });
  });

  it("keeps explicit undefined keys for closed diff navigation", () => {
    expect(diffRouteSearchForNavigation({})).toEqual({
      diff: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });

  it("keeps explicit undefined keys for omitted open diff navigation values", () => {
    expect(diffRouteSearchForNavigation({ diff: "1" })).toEqual({
      diff: "1",
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });

  it("prevents retained diff search params from reopening a closed panel", () => {
    const retainDiffSearch = retainSearchParams<DiffRouteSearch>([
      "diff",
      "diffTurnId",
      "diffFilePath",
    ]);

    expect(
      retainDiffSearch({
        search: {
          diff: "1",
          diffTurnId: TurnId.make("turn-1"),
          diffFilePath: "src/app.ts",
        },
        next: () => diffRouteSearchForNavigation({}),
      }),
    ).toEqual({
      diff: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });

  it("prevents retained turn and file params from overriding whole-thread diff navigation", () => {
    const retainDiffSearch = retainSearchParams<DiffRouteSearch>([
      "diff",
      "diffTurnId",
      "diffFilePath",
    ]);

    expect(
      retainDiffSearch({
        search: {
          diff: "1",
          diffTurnId: TurnId.make("turn-1"),
          diffFilePath: "src/app.ts",
        },
        next: () => diffRouteSearchForNavigation({ diff: "1" }),
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });

  it("strips explicit undefined diff navigation keys after retention", () => {
    const retainDiffSearch = retainSearchParams<DiffRouteSearch>([
      "diff",
      "diffTurnId",
      "diffFilePath",
    ]);
    const stripUndefinedDiffSearch = stripSearchParams<DiffRouteSearch>({
      diff: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
    const runMiddlewares = (search: DiffRouteSearch, next: () => DiffRouteSearch) => {
      return stripUndefinedDiffSearch({
        search,
        next: (retainedSearch) => retainDiffSearch({ search: retainedSearch, next }),
      });
    };

    expect(
      runMiddlewares(
        {
          diff: "1",
          diffTurnId: TurnId.make("turn-1"),
          diffFilePath: "src/app.ts",
        },
        () => diffRouteSearchForNavigation({}),
      ),
    ).toEqual({});
    expect(
      runMiddlewares(
        {
          diff: "1",
          diffTurnId: TurnId.make("turn-1"),
          diffFilePath: "src/app.ts",
        },
        () => diffRouteSearchForNavigation({ diff: "1" }),
      ),
    ).toEqual({ diff: "1" });
  });
});
