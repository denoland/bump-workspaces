# bump_workspace

> A tool for releasing a workspace project.

This tool automatically detects necessary version updates for the modules in a
workspace and creates a PR with necessary changes.

```
deno run --allow-read=. --allow-write=. jsr:@deno/bump_workspace
```

TODO(kt3k): link to example PR

## Commit titles

This tool uses the commit titles as the input for detecting which modules and
versions to update. The commit titles need to follow the following format:

```
<tag>(<modules,...>): <commit message>
```

Some examples are:

```
fix(foo): fix a bug
feat(bar): add a new feature
chore(foo): clean up
chore(bar): clean up
fix(baz,qux): fix a bug
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
