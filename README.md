# @deno/bump-workspaces

> A tool for upgrading Deno workspace packages using conventional commits

[![ci](https://github.com/denoland/bump-workspaces/actions/workflows/ci.yml/badge.svg)](https://github.com/denoland/bump-workspaces/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/denoland/bump-workspaces/graph/badge.svg?token=KUT5Q1PJE6)](https://codecov.io/gh/denoland/bump-workspaces)

This tool detects necessary version upgrades for workspaces packages using
[Conventional Commiets](https://www.conventionalcommits.org/en/v1.0.0/) and
creates a PR.

# Try it

Run this command with `--dry-run` flag in your Deno workspace-enabled project
and see what this command does:

```sh
deno run -A jsr:@deno/bump-workspaces@0.1.9/cli --dry-run
```

# How it works

The below steps describe what this command does:

- Read `deno.json` at the current directory. Read "workspaces". Read `deno.json`
  of each workspace package.
- Collect the git commit messages between the latest tag and the current branch.
- Calculate the necessary updates for each package. (See the below table for
  what version upgrades are performed for each conventional commit tag.)
- Create and print the release note.
- Stop here if `--dry-run` specified, and continue if not.
- Save necessary updates to each `deno.json`.
- Create a new branch `release-YYYY-MM-DD`
- Make git commit the version changes using `GIT_USER_NAME` and `GIT_USER_EMAIL`
  env vars.
- Create a github pull request using `GITHUB_TOKEN` and `GITHUB_REPOSITORY` env
  vars.
- That's all.

# CI set up

Set up the GitHub Actions yaml like the below, and trigger the workflow
manually:

```yaml
name: version_bump

on: workflow_dispatch

jobs:
  build:
    name: version bump
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Clone repository
        uses: actions/checkout@v4

      - name: Set up Deno
        uses: denoland/setup-deno@v1

      - name: Run workspaces version bump
        run: |
          git fetch --unshallow origin
          deno run -A jsr:@deno/bump-workspaces@0.1.9/cli
        env:
          GITHUB_TOKEN: ${{ secrets.BOT_TOKEN }}
```

Example pull request: https://github.com/kt3k/deno_std/pull/34

## How it works

TBD

## Commit titles

This tool uses the commit titles as the input for detecting which modules and
versions to update. The commit titles need to follow the following format:

```
<tag>(<scopes,...>): <commit message>
```

Some examples are:

```
fix(foo): fix a bug
fix(baz,qux): fix a bug
feat(bar): add a new feature
chore(foo): clean up
chore(bar): clean up
BREAKING(quux): some breaking change
```

This example results in the following version updates:

| module | version |
| ------ | ------- |
| foo    | patch   |
| bar    | minor   |
| baz    | patch   |
| qux    | patch   |
| quux   | major   |

The tool automatically detects following commit tags:

- BREAKING
- feat
- fix
- perf
- docs
- deprecation
- refactor
- test
- style
- chore

If a module has `BREAKING` commits, then `major` version will be updated. If a
module has `feat` commits, `minor` version will be updated. Othrewise `patch`
version will be update.

| tag         | version |
| ----------- | ------- |
| BREAKING    | major   |
| feat        | minor   |
| fix         | patch   |
| perf        | patch   |
| docs        | patch   |
| deprecation | patch   |
| refactor    | patch   |
| test        | patch   |
| style       | patch   |
| chore       | patch   |

TODO(kt3k): document scope-required tags.

## Customize version detection

TBD

# License

MIT
