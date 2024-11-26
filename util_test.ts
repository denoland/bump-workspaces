// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { assertEquals, assertExists, assertObjectMatch } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";
import denoJson from "./deno.json" with { type: "json" };
import {
  applyVersionBump,
  checkModuleName,
  createPrBody,
  createReleaseBranchName,
  createReleaseNote,
  createReleaseTitle,
  defaultParseCommitMessage,
  type Diagnostic,
  getModule,
  getWorkspaceModules,
  maxVersion,
  pathProp,
  summarizeVersionBumpsByModule,
  type VersionBump,
  type WorkspaceModule,
} from "./util.ts";
import { tryGetDenoConfig } from "./util.ts";

const emptyCommit = {
  subject: "",
  body: "",
  hash: "",
} as const;

const hash = "0000000000000000000000000000000000000000";

function parse(subject: string, workspaceModules: WorkspaceModule[]) {
  return defaultParseCommitMessage(
    { subject, body: "", hash },
    workspaceModules,
  );
}

Deno.test("defaultParseCommitMessage()", () => {
  const modules: WorkspaceModule[] = [
    { name: "foo", version: "0.0.0", [pathProp]: "" },
    { name: "bar", version: "0.0.0", [pathProp]: "" },
  ];

  assertEquals(parse("feat(foo): add a feature", modules), [
    {
      module: "foo",
      tag: "feat",
      version: "minor",
      commit: {
        subject: "feat(foo): add a feature",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("fix(foo,bar): add a feature", modules), [
    {
      module: "foo",
      tag: "fix",
      version: "patch",
      commit: {
        subject: "fix(foo,bar): add a feature",
        body: "",
        hash,
      },
    },
    {
      module: "bar",
      tag: "fix",
      version: "patch",
      commit: {
        subject: "fix(foo,bar): add a feature",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("fix(*): a bug", modules), [
    {
      module: "foo",
      tag: "fix",
      version: "patch",
      commit: {
        subject: "fix(*): a bug",
        body: "",
        hash,
      },
    },
    {
      module: "bar",
      tag: "fix",
      version: "patch",
      commit: {
        subject: "fix(*): a bug",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("BREAKING(foo): some breaking change", modules), [
    {
      module: "foo",
      tag: "BREAKING",
      version: "major",
      commit: {
        subject: "BREAKING(foo): some breaking change",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("perf(foo): update", modules), [
    {
      module: "foo",
      tag: "perf",
      version: "patch",
      commit: {
        subject: "perf(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("docs(foo): update", modules), [
    {
      module: "foo",
      tag: "docs",
      version: "patch",
      commit: {
        subject: "docs(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("style(foo): update", modules), [
    {
      module: "foo",
      tag: "style",
      version: "patch",
      commit: {
        subject: "style(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("refactor(foo): update", modules), [
    {
      module: "foo",
      tag: "refactor",
      version: "patch",
      commit: {
        subject: "refactor(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("test(foo): update", modules), [
    {
      module: "foo",
      tag: "test",
      version: "patch",
      commit: {
        subject: "test(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("chore(foo): update", modules), [
    {
      module: "foo",
      tag: "chore",
      version: "patch",
      commit: {
        subject: "chore(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("deprecation(foo): update", modules), [
    {
      module: "foo",
      tag: "deprecation",
      version: "patch",
      commit: {
        subject: "deprecation(foo): update",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(parse("feat(foo/unstable): a new unstable feature", modules), [
    {
      module: "foo",
      tag: "feat",
      version: "patch",
      commit: {
        subject: "feat(foo/unstable): a new unstable feature",
        body: "",
        hash,
      },
    },
  ]);

  assertEquals(
    parse("BREAKING(unstable/foo): break some unstable feature", modules),
    [
      {
        module: "foo",
        tag: "BREAKING",
        version: "patch",
        commit: {
          subject: "BREAKING(unstable/foo): break some unstable feature",
          body: "",
          hash,
        },
      },
    ],
  );
});

Deno.test("checkModuleName()", () => {
  assertEquals(
    checkModuleName({ module: "foo", tag: "chore", commit: emptyCommit }, [
      { name: "foo", version: "0.0.0", [pathProp]: "" },
    ]),
    undefined,
  );

  assertEquals(
    checkModuleName({ module: "foo", tag: "chore", commit: emptyCommit }, [
      { name: "bar", version: "0.0.0", [pathProp]: "" },
    ]),
    {
      type: "unknown_range_commit",
      commit: emptyCommit,
      reason: "Unknown module: foo.",
    },
  );

  assertEquals(
    checkModuleName({ module: "foo", tag: "feat", commit: emptyCommit }, [
      { name: "bar", version: "0.0.0", [pathProp]: "" },
    ]),
    {
      type: "unknown_range_commit",
      commit: emptyCommit,
      reason: "Unknown module: foo.",
    },
  );
});

Deno.test("defaultParseCommitMessage() errors with invalid subject", () => {
  const modules: WorkspaceModule[] = [
    { name: "foo", version: "0.0.0", [pathProp]: "" },
    { name: "bar", version: "0.0.0", [pathProp]: "" },
  ];

  assertEquals(parse("random commit", modules), {
    type: "unknown_commit",
    commit: {
      subject: "random commit",
      body: "",
      hash,
    },
    reason: "The commit message does not match the default pattern.",
  });
  assertEquals(parse("fix: update", modules), {
    type: "missing_range",
    commit: {
      subject: "fix: update",
      body: "",
      hash,
    },
    reason: "The commit message does not specify a module.",
  });
  assertEquals(parse("chore: update", modules), {
    type: "skipped_commit",
    commit: {
      subject: "chore: update",
      body: "",
      hash,
    },
    reason: "The commit message does not specify a module.",
  });
  assertEquals(parse("hey(foo): update", modules), {
    type: "unknown_commit",
    commit: {
      subject: "hey(foo): update",
      body: "",
      hash,
    },
    reason: "Unknown commit tag: hey.",
  });
});

const exampleVersionBumps = [
  {
    module: "tools",
    tag: "feat",
    version: "minor",
    commit: {
      subject:
        "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "feat",
    version: "minor",
    commit: {
      subject:
        "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
      body: "",
      hash,
    },
  },
  {
    module: "http",
    tag: "feat",
    version: "minor",
    commit: {
      subject:
        "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "feat",
    version: "minor",
    commit: {
      subject:
        "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(log): remove string formatter (#4239)",
      body: "* BREAKING(log): remove `handlers.ts`\n" +
        "\n" +
        "* fix\n" +
        "\n" +
        "* BREAKING(log): remove string formatter",
      hash,
    },
  },
  {
    module: "streams",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject:
        "BREAKING(streams): remove `readAll()`, `writeAll()` and `copy()` (#4238)",
      body: "",
      hash,
    },
  },
  {
    module: "streams",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject:
        "feat(streams)!: remove `readAll()`, `writeAll()` and `copy()` (#4238)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(log): single-export handler files (#4236)",
      body: "",
      hash,
    },
  },
  {
    module: "io",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(io): remove `types.d.ts` (#4237)",
      body: "",
      hash,
    },
  },
  {
    module: "webgpu",
    tag: "refactor",
    version: "patch",
    commit: {
      subject:
        "refactor(webgpu): use internal `Deno.close()` for cleanup of WebGPU resources (#4231)",
      body: "",
      hash,
    },
  },
  {
    module: "collections",
    tag: "feat",
    version: "minor",
    commit: {
      subject:
        "feat(collections): pass `key` to `mapValues()` transformer (#4127)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "deprecation",
    version: "patch",
    commit: {
      subject:
        "deprecation(semver): rename `eq()`, `neq()`, `lt()`, `lte()`, `gt()` and `gte()` (#4083)",
      body: "",
      hash,
    },
  },
  {
    module: "toml",
    tag: "docs",
    version: "patch",
    commit: {
      subject: "docs(toml): complete documentation (#4223)",
      body: "",
      hash,
    },
  },
  {
    module: "path",
    tag: "deprecation",
    version: "patch",
    commit: {
      subject:
        "deprecation(path): split off all constants into their own files and deprecate old names (#4153)",
      body: "",
      hash,
    },
  },
  {
    module: "msgpack",
    tag: "docs",
    version: "patch",
    commit: {
      subject: "docs(msgpack): complete documentation (#4220)",
      body: "",
      hash,
    },
  },
  {
    module: "media_types",
    tag: "docs",
    version: "patch",
    commit: {
      subject: "docs(media_types): complete documentation (#4219)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "fix",
    version: "patch",
    commit: {
      subject: "fix(log): make `flattenArgs()` private (#4214)",
      body: "",
      hash,
    },
  },
  {
    module: "streams",
    tag: "docs",
    version: "patch",
    commit: {
      subject: "docs(streams): remove `Deno.metrics()` use in example (#4217)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "refactor",
    version: "patch",
    commit: {
      subject: "refactor(log): tidy imports and exports (#4215)",
      body: "",
      hash,
    },
  },
  {
    module: "toml",
    tag: "test",
    version: "patch",
    commit: {
      subject: "test(toml): improve test coverage (#4211)",
      body: "",
      hash,
    },
  },
  {
    module: "console",
    tag: "refactor",
    version: "patch",
    commit: {
      subject: "refactor(console): rename `_rle` to `_run_length.ts` (#4212)",
      body: "",
      hash,
    },
  },
  {
    module: "http",
    tag: "docs",
    version: "patch",
    commit: {
      subject: "docs(http): complete documentation (#4209)",
      body: "",
      hash,
    },
  },
  {
    module: "fmt",
    tag: "fix",
    version: "patch",
    commit: {
      subject: "fix(fmt): correct `stripColor()` deprecation notice (#4208)",
      body: "",
      hash,
    },
  },
  {
    module: "flags",
    tag: "fix",
    version: "patch",
    commit: {
      subject: "fix(flags): correct deprecation notices (#4207)",
      body: "",
      hash,
    },
  },
  {
    module: "toml",
    tag: "fix",
    version: "patch",
    commit: {
      subject:
        "fix(toml): `parse()` duplicates the character next to reserved escape sequences (#4192)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "refactor",
    version: "patch",
    commit: {
      subject:
        "refactor(semver): replace `parseComparator()` with comparator objects (#4204)",
      body: "",
      hash,
    },
  },
  {
    module: "expect",
    tag: "fix",
    version: "patch",
    commit: {
      subject:
        "fix(expect): fix the function signature of `toMatchObject()` (#4202)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "feat",
    version: "minor",
    commit: {
      subject: "feat(log): make handlers disposable (#4195)",
      body: "",
      hash,
    },
  },
  {
    module: "crypto",
    tag: "chore",
    version: "patch",
    commit: {
      subject:
        "chore(crypto): upgrade to `rust@1.75.0` and `wasmbuild@0.15.5` (#4193)",
      body: "",
      hash,
    },
  },
  {
    module: "using",
    tag: "refactor",
    version: "patch",
    commit: {
      subject:
        "refactor(using): use `using` keyword for Explicit Resource Management (#4143)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "deprecation",
    version: "patch",
    commit: {
      subject:
        "deprecation(semver): deprecate `SemVerRange`, introduce `Range` (#4161)",
      body: "",
      hash,
    },
  },
  {
    module: "log",
    tag: "refactor",
    version: "patch",
    commit: {
      subject: "refactor(log): replace deprecated imports (#4188)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "deprecation",
    version: "patch",
    commit: {
      subject: "deprecation(semver): deprecate `outside()` (#4185)",
      body: "",
      hash,
    },
  },
  {
    module: "io",
    tag: "feat",
    version: "minor",
    commit: {
      subject: "feat(io): un-deprecate `Buffer` (#4184)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(semver): remove `FormatStyle` (#4182)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(semver): remove `compareBuild()` (#4181)",
      body: "",
      hash,
    },
  },
  {
    module: "semver",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(semver): remove `rsort()` (#4180)",
      body: "",
      hash,
    },
  },
  {
    module: "http",
    tag: "BREAKING",
    version: "major",
    commit: {
      subject: "BREAKING(http): remove `CookieMap` (#4179)",
      body: "",
      hash,
    },
  },
] as VersionBump[];

Deno.test("summarizeVersionBumpsByModule()", async (t) => {
  await assertSnapshot(t, summarizeVersionBumpsByModule(exampleVersionBumps));
});

Deno.test("maxVersion() returns the bigger version update from the given 2", () => {
  assertEquals(maxVersion("major", "minor"), "major");
  assertEquals(maxVersion("minor", "major"), "major");
  assertEquals(maxVersion("major", "patch"), "major");
  assertEquals(maxVersion("patch", "major"), "major");
  assertEquals(maxVersion("minor", "patch"), "minor");
  assertEquals(maxVersion("patch", "minor"), "minor");
  assertEquals(maxVersion("patch", "patch"), "patch");
});

Deno.test("tryGetDenoConfig()", async () => {
  const [_path, config] = await tryGetDenoConfig(".");
  assertEquals(config.name, denoJson.name);
});

Deno.test("getWorkspaceModules()", async (t) => {
  const [_, modules] = await getWorkspaceModules("testdata/basic");
  assertEquals(modules.length, 5);
  assertEquals(modules.map((m) => m.name), [
    "@scope/foo",
    "@scope/bar",
    "@scope/baz",
    "@scope/qux",
    "@scope/quux",
  ]);
  await assertSnapshot(t, modules);
});

Deno.test("getModule", async () => {
  const [_, modules] = await getWorkspaceModules("testdata/basic");
  const mod = getModule("foo", modules);
  assertExists(mod);
  assertObjectMatch(mod, {
    name: "@scope/foo",
    version: "1.2.3",
  });
});

Deno.test("applyVersionBump() updates the version of the given module", async () => {
  const [denoJson, versionUpdate] = await applyVersionBump(
    {
      module: "foo",
      version: "minor",
      commits: [],
    },
    { name: "@scope/foo", version: "1.0.0", [pathProp]: "foo/deno.json" },
    { name: "@scope/foo", version: "1.0.0", [pathProp]: "foo/deno.json" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(versionUpdate.from, "1.0.0");
  assertEquals(versionUpdate.to, "1.1.0");
  assertEquals(versionUpdate.diff, "minor");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.1.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() consider major bump for 0.x version as minor bump", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "major",
      commits: [],
    },
    { name: "@scope/foo", version: "0.0.0", [pathProp]: "foo/deno.jsonc" },
    { name: "@scope/foo", version: "0.0.0", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.0.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "0.0.0");
  assertEquals(updateResult.to, "0.1.0");
  assertEquals(updateResult.diff, "minor");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() consider minor bump for 0.x version as patch bump", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "minor",
      commits: [],
    },
    { name: "@scope/foo", version: "0.1.0", [pathProp]: "foo/deno.jsonc" },
    { name: "@scope/foo", version: "0.1.0", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "0.1.0");
  assertEquals(updateResult.to, "0.1.1");
  assertEquals(updateResult.diff, "patch");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.1",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() consider any change to prerelease version as prerelease bump", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "minor",
      commits: [],
    },
    { name: "@scope/foo", version: "1.0.0-rc.1", [pathProp]: "foo/deno.jsonc" },
    { name: "@scope/foo", version: "1.0.0-rc.1", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0-rc.1",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "1.0.0-rc.1");
  assertEquals(updateResult.to, "1.0.0-rc.2");
  assertEquals(updateResult.diff, "prerelease");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0-rc.2",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() respect manual version upgrade if the version between start and base is different", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "minor", // This version is ignored, instead manually given version is used for calculating actual version diff
      commits: [],
    },
    { name: "@scope/foo", version: "1.0.0-rc.1", [pathProp]: "foo/deno.jsonc" },
    { name: "@scope/foo", version: "0.224.0", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0-rc.1",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "0.224.0");
  assertEquals(updateResult.to, "1.0.0-rc.1");
  assertEquals(updateResult.diff, "prerelease");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0-rc.1",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() respect manual version upgrade if the version between start and base is different (the case prerelease is removed)", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "patch", // This version is ignored, instead manually given version is used for calculating actual version diff
      commits: [],
    },
    { name: "@scope/foo", version: "1.0.0", [pathProp]: "foo/deno.jsonc" },
    { name: "@scope/foo", version: "1.0.0-rc.1", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "1.0.0-rc.1");
  assertEquals(updateResult.to, "1.0.0");
  assertEquals(updateResult.diff, "major");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

Deno.test("applyVersionBump() works for new module (the case when oldModule is undefined)", async () => {
  const [denoJson, updateResult] = await applyVersionBump(
    {
      module: "foo",
      version: "patch", // <= this version is ignored, instead manually given version is used for calculating actual version diff
      commits: [],
    },
    { name: "@scope/foo", version: "0.1.0", [pathProp]: "foo/deno.jsonc" },
    undefined,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
    true,
  );
  assertEquals(updateResult.from, "0.0.0");
  assertEquals(updateResult.to, "0.1.0");
  assertEquals(updateResult.diff, "minor");
  assertEquals(
    denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.0",
        "scope/bar": "jsr:@scope/bar@^1.0.0"
      }
    }`,
  );
});

async function createVersionUpdateResults(
  versionBumps: VersionBump[],
  modules: WorkspaceModule[],
) {
  const summaries = summarizeVersionBumpsByModule(versionBumps).filter((
    { module },
  ) => getModule(module, modules) !== undefined);
  const diagnostics = versionBumps.map((versionBump) =>
    checkModuleName(versionBump, modules)
  ).filter(Boolean) as Diagnostic[];
  const updates = [];
  for (const summary of summaries) {
    const [_denoJson, versionUpdate] = await applyVersionBump(
      summary,
      getModule(summary.module, modules)!,
      getModule(summary.module, modules)!,
      "",
      true,
    );
    updates.push(versionUpdate);
  }
  return [updates, diagnostics] as const;
}

Deno.test("createReleaseNote()", async (t) => {
  const [_, modules] = await getWorkspaceModules("testdata/std_mock");
  const [updates, _diagnostics] = await createVersionUpdateResults(
    exampleVersionBumps,
    modules,
  );
  await assertSnapshot(t, createReleaseNote(updates, modules, new Date(0)));
});

Deno.test("createPrBody()", async (t) => {
  const [_, modules] = await getWorkspaceModules("testdata/std_mock");
  const [updates, diagnostics] = await createVersionUpdateResults(
    exampleVersionBumps,
    modules,
  );
  await assertSnapshot(
    t,
    createPrBody(
      updates,
      diagnostics,
      "denoland/deno_std",
      "release-1970-01-01-00-00-00",
    ),
  );
});

Deno.test("createReleaseBranchName()", () => {
  const date = new Date(0);
  assertEquals(
    createReleaseBranchName(date),
    "release-1970-01-01-00-00-00",
  );
});

Deno.test("createReleaseTitle()", () => {
  const date = new Date(0);
  assertEquals(createReleaseTitle(date), "1970.01.01");
});
