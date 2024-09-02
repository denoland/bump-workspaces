// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "@std/cli/parse-args";
import { bumpWorkspaces } from "./mod.ts";

/**
 * The CLI entrypoint of the package. You can directly perform the version bump behavior from CLI:
 *
 * ```sh
 * deno run -A jsr:@deno/bump-workspaces/cli
 * ```
 *
 * The endpoint supports --dry-run option:
 *
 * ```sh
 * deno run -A jsr:@deno/bump-workspaces/cli --dry-run
 * ```
 *
 * You can specify import map path by `--import-map` option (Default is deno.json(c) at the root):
 *
 * ```sh
 * deno run -A jsr:@deno/bump-workspaces/cli --import-map ./import_map.json
 * ```
 *
 * @module
 */

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["import-map"],
    boolean: ["dry-run"],
  });
  await bumpWorkspaces({
    dryRun: args["dry-run"],
    importMap: args["import-map"],
  });
}
