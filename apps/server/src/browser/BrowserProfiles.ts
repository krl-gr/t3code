// @effect-diagnostics nodeBuiltinImport:off
import path from "node:path";

import { DEFAULT_BROWSER_PROFILE_ID } from "./BrowserPolicy.ts";

export interface BrowserProfilePaths {
  readonly profilesDir: string;
  readonly defaultProfileDir: string;
}

export function resolveBrowserProfilePaths(stateDir: string): BrowserProfilePaths {
  const profilesDir = path.join(stateDir, "browser-profiles");
  return {
    profilesDir,
    defaultProfileDir: path.join(profilesDir, DEFAULT_BROWSER_PROFILE_ID),
  };
}
