// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "@std/cli/parse-args";
import { bumpWorkspace } from "./mod.ts";

/**
 * The CLI entrypoint of the package. You can directly perform the version bump behavior from CLI:
 *
 * ```sh
 * deno run -A jsr:@deno/bump-workspaces
 * ```
 *
 * The endpoint supports --dry-run option:
 *
 * ```sh
 * deno run -A jsr:@deno/bump-workspaces --dry-run
 * ```
 *
 * @module
 */

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run"],
  });
  await bumpWorkspace({ dryRun: args["dry-run"] });
}
