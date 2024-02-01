# bump_workspaces

> A tool for releasing workspaces with Deno project.

[![ci](https://github.com/denoland/bump_workspaces/actions/workflows/ci.yml/badge.svg)](https://github.com/denoland/bump_workspaces/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/denoland/bump_workspaces/graph/badge.svg?token=KUT5Q1PJE6)](https://codecov.io/gh/denoland/bump_workspaces)

This tool automatically detects necessary version updates for the workspaces and
creates a PR with necessary changes.

```sh
deno run -A https://deno.land/x/bump_workspaces@v0.1.3/cli.ts --dry-run
```

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
          deno run -A https://deno.land/x/bump_workspaces@v0.1.3/cli.ts
        env:
          GITHUB_TOKEN: ${{ secrets.BOT_TOKEN }}
```

Example pull request: https://github.com/kt3k/deno_std/pull/34

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

# License

MIT
