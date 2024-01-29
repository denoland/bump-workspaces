// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { $ } from "https://deno.land/x/dax@0.37.1/mod.ts";
import { Octokit } from "npm:octokit@^3.1";
import { cyan, magenta } from "std/fmt/colors.ts";
import { ensureFile } from "std/fs/ensure_file.ts";
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
  pathProp,
  summarizeVersionBumpsByModule,
  type VersionBump,
  type VersionUpdateResult,
} from "./util.ts";

// A random separator that is unlikely to be in a commit message.
const separator = "#%$".repeat(35);

export type BumpWorkspaceOptions = {
  start?: string;
  baseBranchName?: string;
  parseCommitMessage?: (commit: Commit) => VersionBump[] | Diagnostic;
  gitUserName?: string;
  gitUserEmail?: string;
  /** The github token e.g. */
  githubToken?: string;
  /** The github repository e.g. denoland/deno_std */
  githubRepo?: string;
  /** Doesn't perform file edits and git ops when true. */
  dryRun?: boolean;
  /** The path to release note markdown file. The dfault is `Releases.md` */
  releaseNotePath?: string;
};

export function nop() {
  // Do nothing
}

export async function bumpWorkspace(
  {
    parseCommitMessage = defaultParseCommitMessage,
    start,
    baseBranchName,
    gitUserName = "denobot",
    gitUserEmail = "33910674+denobot@users.noreply.github.com",
    githubToken,
    githubRepo,
    dryRun = false,
    releaseNotePath = "Releases.md",
  }: BumpWorkspaceOptions = {},
) {
  const now = new Date();
  const modules = await getWorkspaceModules();
  start ??= await $`git describe --tags --abbrev=0`.text();
  const newBranchName = createReleaseBranchName(now);
  baseBranchName ??= await $`git branch --show-current`.text();
  const text =
    await $`git --no-pager log --pretty=format:${separator}%B ${start}..${baseBranchName}`
      .text();
  const commits = text.split(separator).map((commit) => {
    const i = commit.indexOf("\n");
    const subject = commit.slice(0, i).trim();
    const body = commit.slice(i + 1).trim();
    return { subject, body };
  });
  commits.shift();
  console.log(
    `Found ${cyan(commits.length.toString())} commits between ${
      magenta(start)
    } and ${magenta(baseBranchName)}.`,
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
  let denoJson = await Deno.readTextFile("deno.json");
  for (const summary of summaries) {
    const module = getModule(summary.module, modules)!;
    const applied = await applyVersionBump(
      summary,
      module,
      denoJson,
      dryRun,
    );
    denoJson = applied.denoJson;
    updates[module.name] = {
      diff: applied.diff,
      from: applied.oldVersion,
      to: applied.newVersion,
      path: module[pathProp],
      summary,
    };
  }
  console.table(updates, ["diff", "from", "to", "path"]);

  console.log(`Found ${cyan(diagnostics.length.toString())} unknown commits:`);
  for (const unknownCommit of diagnostics) {
    console.log(`  ${unknownCommit.type} ${unknownCommit.commit.subject}`);
  }

  const releaseNote = createReleaseNote(Object.values(updates), modules, now);
  const prBody = createPrBody(Object.values(updates), diagnostics);

  if (dryRun) {
    console.log("Skip making a commit.");
    console.log("Skip making a pull request.");
    console.log();
    console.log(releaseNote);
    console.log(prBody);
  } else {
    // Updates deno.json
    await Deno.writeTextFile("deno.json", denoJson);

    // Prepend release notes
    await ensureFile(releaseNotePath);
    await Deno.writeTextFile(
      releaseNotePath,
      releaseNote + "\n" + await Deno.readTextFile(releaseNotePath),
    );

    // Makes a commit
    console.log(
      `Creating a git commit in the new branch ${magenta(newBranchName)}.`,
    );
    await $`git checkout -b ${newBranchName}`;
    await $`git add .`;
    await $`git commit --author="${gitUserName} <${gitUserEmail}>" -m "chore: update versions"`;
    console.log(`Pushing the new branch ${magenta(newBranchName)}.`);
    await $`git push origin ${newBranchName}`;

    // Makes a PR
    console.log(`Creating a pull request.`);
    const octoKit = new Octokit({ auth: githubToken });
    if (githubRepo === undefined) {
      console.error("GITHUB_REPOSITORY is not set.");
      Deno.exit(1);
    }
    const [owner, repo] = githubRepo.split("/");
    const openedPr = await octoKit.request("POST /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      base: baseBranchName,
      head: newBranchName,
      draft: true,
      title: `Release ${createReleaseTitle(now)}`,
      body: createPrBody(Object.values(updates), diagnostics),
    });
    console.log("New pull request:", cyan(openedPr.data.html_url));
  }

  console.log("Done.");
}

if (import.meta.main) {
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
  await bumpWorkspace({ githubToken, githubRepo, dryRun: false });
}
