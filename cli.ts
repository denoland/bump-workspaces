// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "https://deno.land/std@0.214.0/cli/parse_args.ts";
import { bumpWorkspaces } from "./mod.ts";

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run"],
  });
  await bumpWorkspaces({ dryRun: args["dry-run"] });
}
