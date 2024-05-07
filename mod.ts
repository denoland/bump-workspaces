// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { $ } from "@david/dax";
import { Octokit } from "npm:octokit@^3.1";
import { cyan, magenta } from "@std/fmt/colors";
import { ensureFile } from "@std/fs/ensure-file";
import { join } from "@std/path/join";

/**
 * Upgrade the versions of the packages in the workspaces using Conventional Commits rules.
 *
 * The workflow of this function is:
 * - Read workspaces info from the deno.json in the given `root`.
 * - Read commit messages between the given `start` and `base`.
 *   - `start` defaults to the latest tag in the current branch (=`git describe --tags --abbrev=0`)
 *   - `base` defaults to the current branch (=`git branch --show-current`)
 * - Detect necessary version updates from the commit messages.
 * - Update the versions in the deno.json files.
 * - Create a release note.
 * - Create a git commit with given `gitUserName` and `gitUserEmail`.
 * - Create a pull request, targeting the given `base` branch.
 *
 * @module
 */

import {
  applyVersionBump,
  checkModuleName,
  type Commit,
  createPrBody,
  createReleaseBranchName,
  createReleaseNote,
  createReleaseTitle,
  defaultParseCommitMessage,
  type Diagnostic,
  getModule,
  getWorkspaceModules,
  summarizeVersionBumpsByModule,
  type VersionBump,
  type VersionUpdateResult,
} from "./util.ts";

// A random separator that is unlikely to be in a commit message.
const separator = "#%$".repeat(35);

/** The option for {@linkcode bumpWorkspaces} */
export type BumpWorkspaceOptions = {
  /** The git tag or commit hash to start from. The default is the latest tag. */
  start?: string;
  /** The base branch name to compare commits. The default is the current branch. */
  base?: string;
  parseCommitMessage?: (commit: Commit) => VersionBump[] | Diagnostic;
  /** The root directory of the workspace. */
  root?: string;
  /** The git user name which is used for making a commit */
  gitUserName?: string;
  /** The git user email which is used for making a commit */
  gitUserEmail?: string;
  /** The github token e.g. */
  githubToken?: string;
  /** The github repository e.g. denoland/deno_std */
  githubRepo?: string;
  /** Perform all operations if false.
   * Doesn't perform file edits and network operations when true.
   * Perform fs ops, but doesn't perform git operations when "network" */
  dryRun?: boolean | "git";
  /** The path to release note markdown file. The dfault is `Releases.md` */
  releaseNotePath?: string;
};

/**
 * Upgrade the versions of the packages in the workspaces using Conventional Commits rules.
 *
 * The workflow of this function is:
 * - Read workspaces info from the deno.json in the given `root`.
 * - Read commit messages between the given `start` and `base`.
 *   - `start` defaults to the latest tag in the current branch (=`git describe --tags --abbrev=0`)
 *   - `base` defaults to the current branch (=`git branch --show-current`)
 * - Detect necessary version updates from the commit messages.
 * - Update the versions in the deno.json files.
 * - Create a release note.
 * - Create a git commit with given `gitUserName` and `gitUserEmail`.
 * - Create a pull request, targeting the given `base` branch.
 */
export async function bumpWorkspaces(
  {
    parseCommitMessage = defaultParseCommitMessage,
    start,
    base,
    gitUserName,
    gitUserEmail,
    githubToken,
    githubRepo,
    dryRun = false,
    releaseNotePath = "Releases.md",
    root = ".",
  }: BumpWorkspaceOptions = {},
) {
  const now = new Date();
  start ??= await $`git describe --tags --abbrev=0`.text();
  base ??= await $`git branch --show-current`.text();
  if (!base) {
    console.error("The current branch is not found.");
    Deno.exit(1);
  }

  await $`git checkout ${start}`;
  const [_oldConfigPath, oldModules] = await getWorkspaceModules(root);
  await $`git checkout -`;
  await $`git checkout ${base}`;
  const [configPath, modules] = await getWorkspaceModules(root);
  await $`git checkout -`;

  const newBranchName = createReleaseBranchName(now);
  releaseNotePath = join(root, releaseNotePath);

  const text =
    await $`git --no-pager log --pretty=format:${separator}%H%B ${start}..${base}`
      .text();

  const commits = text.split(separator).map((commit) => {
    const hash = commit.slice(0, 40);
    commit = commit.slice(40);
    const i = commit.indexOf("\n");
    if (i < 0) {
      return { hash, subject: commit.trim(), body: "" };
    }
    const subject = commit.slice(0, i).trim();
    const body = commit.slice(i + 1).trim();
    return { hash, subject, body };
  });
  commits.shift(); // drop the first empty item

  console.log(
    `Found ${cyan(commits.length.toString())} commits between ${
      magenta(start)
    } and ${magenta(base)}.`,
  );
  const versionBumps: VersionBump[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const commit of commits) {
    if (/^v?\d+\.\d+\.\d+/.test(commit.subject)) {
      // Skip if the commit subject is version bump
      continue;
    }
    if (/^Release \d+\.\d+\.\d+/.test(commit.subject)) {
      // Skip if the commit subject is release
      continue;
    }
    const parsed = parseCommitMessage(commit);
    if (Array.isArray(parsed)) {
      for (const versionBump of parsed) {
        const diagnostic = checkModuleName(versionBump, modules);
        if (diagnostic) {
          diagnostics.push(diagnostic);
        } else {
          versionBumps.push(versionBump);
        }
      }
    } else {
      // The commit message is completely unknown
      diagnostics.push(parsed);
    }
  }
  const summaries = summarizeVersionBumpsByModule(versionBumps);

  if (summaries.length === 0) {
    console.log("No version bumps.");
    return;
  }

  console.log(`Updating the versions:`);
  const updates: Record<string, VersionUpdateResult> = {};
  let denoJson = await Deno.readTextFile(configPath);
  for (const summary of summaries) {
    const module = getModule(summary.module, modules)!;
    const oldModule = getModule(summary.module, oldModules);
    const [denoJson_, versionUpdate] = await applyVersionBump(
      summary,
      module,
      oldModule,
      denoJson,
      dryRun === true,
    );
    denoJson = denoJson_;
    updates[module.name] = versionUpdate;
  }
  console.table(updates, ["diff", "from", "to", "path"]);

  console.log(
    `Found ${cyan(diagnostics.length.toString())} diagnostics:`,
  );
  for (const unknownCommit of diagnostics) {
    console.log(`  ${unknownCommit.type} ${unknownCommit.commit.subject}`);
  }

  const releaseNote = createReleaseNote(Object.values(updates), modules, now);

  if (dryRun === true) {
    console.log();
    console.log(cyan("The release note:"));
    console.log(releaseNote);
    console.log(cyan("Skip making a commit."));
    console.log(cyan("Skip making a pull request."));
  } else {
    // Updates deno.json
    await Deno.writeTextFile(configPath, denoJson);

    // Prepend release notes
    await ensureFile(releaseNotePath);
    await Deno.writeTextFile(
      releaseNotePath,
      releaseNote + "\n" + await Deno.readTextFile(releaseNotePath),
    );

    if (dryRun === false) {
      gitUserName ??= Deno.env.get("GIT_USER_NAME");
      if (gitUserName === undefined) {
        console.error("GIT_USER_NAME is not set.");
        Deno.exit(1);
      }
      gitUserEmail ??= Deno.env.get("GIT_USER_EMAIL");
      if (gitUserEmail === undefined) {
        console.error("GIT_USER_EMAIL is not set.");
        Deno.exit(1);
      }
      githubToken ??= Deno.env.get("GITHUB_TOKEN");
      if (githubToken === undefined) {
        console.error("GITHUB_TOKEN is not set.");
        Deno.exit(1);
      }
      githubRepo ??= Deno.env.get("GITHUB_REPOSITORY");
      if (githubRepo === undefined) {
        console.error("GITHUB_REPOSITORY is not set.");
        Deno.exit(1);
      }

      // Makes a commit
      console.log(
        `Creating a git commit in the new branch ${magenta(newBranchName)}.`,
      );
      await $`git checkout -b ${newBranchName}`;
      await $`git add .`;
      await $`git -c "user.name=${gitUserName}" -c "user.email=${gitUserEmail}" commit -m "chore: update versions"`;

      console.log(`Pushing the new branch ${magenta(newBranchName)}.`);
      await $`git push origin ${newBranchName}`;

      // Makes a PR
      console.log(`Creating a pull request.`);
      const octoKit = new Octokit({ auth: githubToken });
      const [owner, repo] = githubRepo.split("/");
      const openedPr = await octoKit.request(
        "POST /repos/{owner}/{repo}/pulls",
        {
          owner,
          repo,
          base: base,
          head: newBranchName,
          draft: true,
          title: `Release ${createReleaseTitle(now)}`,
          body: createPrBody(Object.values(updates), diagnostics, githubRepo),
        },
      );
      console.log("New pull request:", cyan(openedPr.data.html_url));
    }

    console.log("Done.");
  }
}
