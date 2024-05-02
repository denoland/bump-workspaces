// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "@std/cli/parse-args";
import { bumpWorkspaces } from "./mod.ts";

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run"],
  });
  await bumpWorkspaces({ dryRun: args["dry-run"] });
}
