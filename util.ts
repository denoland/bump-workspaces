// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { parse as parseJsonc } from "std/jsonc/parse.ts";
import { join } from "std/path/join.ts";
import { resolve } from "std/path/resolve.ts";
import {
  format as formatSemver,
  increment,
  parse as parseSemVer,
} from "std/semver/mod.ts";

export type VersionUpdate = "major" | "minor" | "patch";

export type Commit = {
  subject: string;
  body: string;
  hash: string;
};

export type CommitWithTag = Commit & { tag: string };

export const pathProp = Symbol.for("path");

export type WorkspaceModule = {
  name: string;
  version: string;
  [pathProp]: string;
};

export type VersionBump = {
  module: string;
  tag: string;
  commit: Commit;
  version: VersionUpdate;
};

export type VersionBumpSummary = {
  module: string;
  version: VersionUpdate;
  commits: CommitWithTag[];
};

export type Diagnostic =
  | UnknownCommit
  | UnknownRangeCommit
  | SkippedCommit
  | MissingRange;

export type UnknownCommit = {
  type: "unknown_commit";
  commit: Commit;
  reason: string;
};

export type MissingRange = {
  type: "missing_range";
  commit: Commit;
  reason: string;
};

export type UnknownRangeCommit = {
  type: "unknown_range_commit";
  commit: Commit;
  reason: string;
};

export type SkippedCommit = {
  type: "skipped_commit";
  commit: Commit;
  reason: string;
};

export type AppliedVersionBump = {
  oldVersion: string;
  newVersion: string;
  diff: VersionUpdate;
  denoJson: string;
};

export type VersionUpdateResult = {
  from: string;
  to: string;
  diff: VersionUpdate;
  path: string;
  summary: VersionBumpSummary;
};

const RE_DEFAULT_PATTERN = /^([^:()]+)(?:\((.+)\))?: (.*)$/;

// Defines the version bump for each tag.
const TAG_TO_VERSION: Record<string, "major" | "minor" | "patch"> = {
  BREAKING: "major",
  feat: "minor",
  deprecation: "patch",
  fix: "patch",
  perf: "patch",
  docs: "patch",
  style: "patch",
  refactor: "patch",
  test: "patch",
  chore: "patch",
};

const TAG_PRIORITY = Object.keys(TAG_TO_VERSION);

export const DEFAULT_RANGE_REQUIED = [
  "BREAKING",
  "feat",
  "fix",
  "perf",
  "deprecation",
];

export function defaultParseCommitMessage(
  commit: Commit,
): VersionBump[] | Diagnostic {
  const match = RE_DEFAULT_PATTERN.exec(commit.subject);
  if (match === null) {
    return {
      type: "unknown_commit",
      commit,
      reason: "The commit message does not match the default pattern.",
    };
  }
  const [, tag, module, _message] = match;
  const modules = module ? module.split(/\s*,\s*/) : [];
  if (modules.length === 0) {
    if (DEFAULT_RANGE_REQUIED.includes(tag)) {
      return {
        type: "missing_range",
        commit,
        reason: "The commit message does not specify a module.",
      };
    }
    return {
      type: "skipped_commit",
      commit,
      reason: "The commit message does not specify a module.",
    };
  }
  const version = TAG_TO_VERSION[tag];
  if (version === undefined) {
    return {
      type: "unknown_commit",
      commit,
      reason: `Unknown commit tag: ${tag}.`,
    };
  }
  return modules.map((module) => ({ module, tag, version, commit }));
}

export function summarizeVersionBumpsByModule(
  versionBumps: VersionBump[],
): VersionBumpSummary[] {
  const result = {} as Record<string, VersionBumpSummary>;
  for (const versionBump of versionBumps) {
    const { module, version } = versionBump;
    const summary = result[module] = result[module] ?? {
      module,
      version,
      commits: [],
    };
    summary.version = maxVersion(summary.version, version);
    summary.commits.push({ ...versionBump.commit, tag: versionBump.tag });
  }
  for (const summary of Object.values(result)) {
    summary.commits.sort((a, b) => {
      const priorityA = TAG_PRIORITY.indexOf(a.tag);
      const priorityB = TAG_PRIORITY.indexOf(b.tag);
      if (priorityA === priorityB) {
        return 0;
      }
      return priorityA < priorityB ? -1 : 1;
    });
  }
  return Object.values(result);
}

export function maxVersion(
  v0: VersionUpdate,
  v1: VersionUpdate,
): VersionUpdate {
  if (v0 === "major" || v1 === "major") {
    return "major";
  }
  if (v0 === "minor" || v1 === "minor") {
    return "minor";
  }
  return "patch";
}

export async function tryGetDenoConfig(
  path = ".",
  // deno-lint-ignore no-explicit-any
): Promise<[path: string, config: any]> {
  let denoJson: string | undefined;
  let denoJsonPath: string | undefined;
  try {
    denoJsonPath = join(path, "deno.json");
    denoJson = await Deno.readTextFile(denoJsonPath);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }

  if (!denoJson) {
    try {
      denoJsonPath = join(path, "deno.jsonc");
      denoJson = await Deno.readTextFile(denoJsonPath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.log(`No deno.json or deno.jsonc found in ${resolve(path)}`);
        Deno.exit(1);
      }
      throw e;
    }
  }

  try {
    return [denoJsonPath!, parseJsonc(denoJson)];
  } catch (e) {
    console.log("Invalid deno.json or deno.jsonc file.");
    console.log(e);
    Deno.exit(1);
  }
}

export async function getWorkspaceModules(): Promise<WorkspaceModule[]> {
  const [_, denoConfig] = await tryGetDenoConfig();
  const workspaces = denoConfig.workspaces;

  if (!Array.isArray(workspaces)) {
    console.log("deno.json doesn't have workspaces field.");
    Deno.exit(1);
  }

  const result = [];
  for (const workspace of workspaces) {
    if (typeof workspace !== "string") {
      console.log("deno.json workspaces field should be an array of strings.");
      Deno.exit(1);
    }
    const [path, workspaceConfig] = await tryGetDenoConfig(workspace);
    if (!workspaceConfig.name) {
      console.log(`${join(workspace, "deno.json")} doesn't have name field.`);
      Deno.exit(1);
    }
    result.push({ ...workspaceConfig, [pathProp]: path });
  }
  return result;
}

export function getModule(module: string, modules: WorkspaceModule[]) {
  return modules.find((m) =>
    m.name === module || m.name.endsWith(`/${module}`)
  );
}

export function checkModuleName(
  versionBump: Pick<VersionBump, "module" | "commit" | "tag">,
  modules: WorkspaceModule[],
): Diagnostic | undefined {
  if (getModule(versionBump.module, modules)) {
    return undefined;
  }
  // The commit include unknown module name
  return {
    type: "unknown_range_commit",
    commit: versionBump.commit,
    reason: `Unknown module: ${versionBump.module}.`,
  };
}

/** Apply the version bump to the file system. */
export async function applyVersionBump(
  summary: Pick<VersionBumpSummary, "module" | "version">,
  module: WorkspaceModule,
  denoJson: string,
  dryRun = false,
): Promise<AppliedVersionBump> {
  const oldVersionStr = module.version;
  const oldVersion = parseSemVer(oldVersionStr);
  let diff = summary.version;
  // If the old version is 0.x.y, then breaking change is considered as minor
  if (diff === "major" && oldVersion.major === 0) {
    diff = "minor";
  }
  const newVersion = increment(oldVersion, diff);
  const newVersionStr = formatSemver(newVersion);
  module.version = newVersionStr;
  const path = module[pathProp];
  if (!dryRun) {
    await Deno.writeTextFile(path, JSON.stringify(module, null, 2) + "\n");
  }
  denoJson = denoJson.replace(
    new RegExp(`${module.name}@([^~]?)${oldVersionStr}`, "g"),
    `${module.name}@$1${newVersionStr}`,
  );
  if (path.endsWith("deno.jsonc")) {
    console.warn(
      `Currently this tool doesn't keep the comments in deno.jsonc files. Comments in the path "${path}" might be removed by this update.`,
    );
  }
  return {
    oldVersion: oldVersionStr,
    newVersion: newVersionStr,
    diff,
    denoJson,
  };
}

export function createReleaseNote(
  updates: VersionUpdateResult[],
  modules: WorkspaceModule[],
  date: Date,
) {
  const heading = `### ${createReleaseTitle(date)}\n\n`;
  return heading + updates.map((u) => {
    const module = getModule(u.summary.module, modules)!;
    return `#### ${module.name} ${u.to} (${u.diff}) \n` +
      u.summary.commits.map((c) => `- ${c.subject}\n`).join("");
  }).join("\n");
}

export function createPrBody(
  updates: VersionUpdateResult[],
  diagnostics: Diagnostic[],
  githubRepo: string,
) {
  const table = updates.map((u) =>
    "|" + [u.summary.module, u.from, u.to, u.diff].join("|") + "|"
  ).join("\n");

  const unknownCommitsNotes = createDiagnosticsNotes(
    "The following commits are not recognized. Please handle them manually if necessary:",
    "unknown_commit",
  );
  const unknownRangesNotes = createDiagnosticsNotes(
    "The following commits have unknown scopes. Please handle them manually if necessary:",
    "unknown_range_commit",
  );
  const missingRangesNotes = createDiagnosticsNotes(
    "Required scopes are missing in the following commits. Please handle them manually if necessary:",
    "missing_range",
  );
  const ignoredCommitsNotes = createDiagnosticsNotes(
    "The following commits are ignored:",
    "skipped_commit",
  );
  return `The following updates are detected:

| module   | from    | to      | type  |
|----------|---------|---------|-------|
${table}

Please ensure:
- [ ] Versions in deno.json files are updated correctly
- [ ] Releases.md is updated correctly

${unknownCommitsNotes}

${unknownRangesNotes}

${missingRangesNotes}

${ignoredCommitsNotes}

---

To make edits to this PR:

\`\`\`sh
git fetch upstream release_0_213.0 && git checkout -b release_0_213.0 upstream/release_0_213.0
\`\`\`
`;
  function createDiagnosticsNotes(
    note: string,
    type: string,
  ) {
    const diagnostics_ = diagnostics.filter((d) => d.type === type);
    if (diagnostics_.length === 0) {
      return "";
    }
    return `${note}\n\n` +
      diagnostics_.map((d) =>
        `- [${d.commit.subject}](/${githubRepo}/commit/${d.commit.hash})`
      ).join("\n");
  }
}

export function createReleaseBranchName(date: Date) {
  return "release-" +
    date.toISOString().replace("T", "-").replaceAll(":", "-").replace(
      /\..+/,
      "",
    );
}

export function createReleaseTitle(d: Date) {
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const date = d.getUTCDate().toString().padStart(2, "0");
  return `${year}.${month}.${date}`;
}
