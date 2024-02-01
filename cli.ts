// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parseArgs } from "https://deno.land/std@0.214.0/cli/parse_args.ts";
import { bumpWorkspaces } from "./mod.ts";

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run"],
  });
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (githubToken === undefined) {
    console.error("GITHUB_TOKEN is not set.");
    Deno.exit(1);
  }
  const githubRepo = Deno.env.get("GITHUB_REPOSITORY");
  if (githubRepo === undefined) {
    console.error("GITHUB_REPOSITORY is not set.");
    Deno.exit(1);
  }
  await bumpWorkspaces({ githubToken, githubRepo, dryRun: args["dry-run"] });
}
