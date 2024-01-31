// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { assertEquals } from "std/assert/mod.ts";
import denoJson from "./deno.json" with { type: "json" };
import {
  applyVersionBump,
  checkModuleName,
  createReleaseBranchName,
  createReleaseTitle,
  defaultParseCommitMessage,
  maxVersion,
  pathProp,
  summarizeVersionBumpsByModule,
  VersionBump,
} from "./util.ts";
import { tryGetDenoConfig } from "./util.ts";

const emptyCommit = {
  subject: "",
  body: "",
  hash: "",
} as const;

const hash = "0000000000000000000000000000000000000000";

function parse(subject: string) {
  return defaultParseCommitMessage({ subject, body: "", hash });
}

Deno.test("defaultParseCommitMessage()", () => {
  assertEquals(parse("feat(foo): add a feature"), [
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

  assertEquals(parse("fix(foo,bar): add a feature"), [
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

  assertEquals(parse("BREAKING(foo): some breaking change"), [
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

  assertEquals(parse("perf(foo): update"), [
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

  assertEquals(parse("docs(foo): update"), [
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

  assertEquals(parse("style(foo): update"), [
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

  assertEquals(parse("refactor(foo): update"), [
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

  assertEquals(parse("test(foo): update"), [
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

  assertEquals(parse("chore(foo): update"), [
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

  assertEquals(parse("deprecation(foo): update"), [
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
  assertEquals(parse("random commit"), {
    type: "unknown_commit",
    commit: {
      subject: "random commit",
      body: "",
      hash,
    },
    reason: "The commit message does not match the default pattern.",
  });
  assertEquals(parse("fix: update"), {
    type: "missing_range",
    commit: {
      subject: "fix: update",
      body: "",
      hash,
    },
    reason: "The commit message does not specify a module.",
  });
  assertEquals(parse("chore: update"), {
    type: "skipped_commit",
    commit: {
      subject: "chore: update",
      body: "",
      hash,
    },
    reason: "The commit message does not specify a module.",
  });
  assertEquals(parse("hey(foo): update"), {
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
      body: "* BREAKING(log): remove `handlers.ts`\r\n" +
        "\r\n" +
        "* fix\r\n" +
        "\r\n" +
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

Deno.test("summarizeVersionBumpsByModule()", () => {
  assertEquals(summarizeVersionBumpsByModule(exampleVersionBumps), [
    {
      module: "tools",
      version: "minor",
      commits: [
        {
          subject:
            "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
          body: "",
          tag: "feat",
          hash,
        },
      ],
    },
    {
      module: "log",
      version: "major",
      commits: [
        {
          subject: "BREAKING(log): remove string formatter (#4239)",
          body:
            "* BREAKING(log): remove `handlers.ts`\r\n\r\n* fix\r\n\r\n* BREAKING(log): remove string formatter",
          tag: "BREAKING",
          hash,
        },
        {
          subject: "BREAKING(log): single-export handler files (#4236)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject:
            "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
          body: "",
          tag: "feat",
          hash,
        },
        {
          subject: "feat(log): make handlers disposable (#4195)",
          body: "",
          tag: "feat",
          hash,
        },
        {
          subject: "fix(log): make `flattenArgs()` private (#4214)",
          body: "",
          tag: "fix",
          hash,
        },
        {
          subject: "refactor(log): tidy imports and exports (#4215)",
          body: "",
          tag: "refactor",
          hash,
        },
        {
          subject: "refactor(log): replace deprecated imports (#4188)",
          body: "",
          tag: "refactor",
          hash,
        },
      ],
    },
    {
      module: "http",
      version: "major",
      commits: [
        {
          subject: "BREAKING(http): remove `CookieMap` (#4179)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject:
            "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
          body: "",
          tag: "feat",
          hash,
        },
        {
          subject: "docs(http): complete documentation (#4209)",
          body: "",
          tag: "docs",
          hash,
        },
      ],
    },
    {
      module: "semver",
      version: "major",
      commits: [
        {
          subject: "BREAKING(semver): remove `FormatStyle` (#4182)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject: "BREAKING(semver): remove `compareBuild()` (#4181)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject: "BREAKING(semver): remove `rsort()` (#4180)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject:
            "feat(tools,log,http,semver): check mod exports, export items consistently from mod.ts  (#4229)",
          body: "",
          tag: "feat",
          hash,
        },
        {
          subject:
            "deprecation(semver): rename `eq()`, `neq()`, `lt()`, `lte()`, `gt()` and `gte()` (#4083)",
          body: "",
          tag: "deprecation",
          hash,
        },
        {
          subject:
            "deprecation(semver): deprecate `SemVerRange`, introduce `Range` (#4161)",
          body: "",
          tag: "deprecation",
          hash,
        },
        {
          subject: "deprecation(semver): deprecate `outside()` (#4185)",
          body: "",
          tag: "deprecation",
          hash,
        },
        {
          subject:
            "refactor(semver): replace `parseComparator()` with comparator objects (#4204)",
          body: "",
          tag: "refactor",
          hash,
        },
      ],
    },
    {
      module: "streams",
      version: "major",
      commits: [
        {
          subject:
            "BREAKING(streams): remove `readAll()`, `writeAll()` and `copy()` (#4238)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject:
            "docs(streams): remove `Deno.metrics()` use in example (#4217)",
          body: "",
          tag: "docs",
          hash,
        },
      ],
    },
    {
      module: "io",
      version: "major",
      commits: [
        {
          subject: "BREAKING(io): remove `types.d.ts` (#4237)",
          body: "",
          tag: "BREAKING",
          hash,
        },
        {
          subject: "feat(io): un-deprecate `Buffer` (#4184)",
          body: "",
          tag: "feat",
          hash,
        },
      ],
    },
    {
      module: "webgpu",
      version: "patch",
      commits: [
        {
          subject:
            "refactor(webgpu): use internal `Deno.close()` for cleanup of WebGPU resources (#4231)",
          body: "",
          tag: "refactor",
          hash,
        },
      ],
    },
    {
      module: "collections",
      version: "minor",
      commits: [
        {
          subject:
            "feat(collections): pass `key` to `mapValues()` transformer (#4127)",
          body: "",
          tag: "feat",
          hash,
        },
      ],
    },
    {
      module: "toml",
      version: "patch",
      commits: [
        {
          subject:
            "fix(toml): `parse()` duplicates the character next to reserved escape sequences (#4192)",
          body: "",
          tag: "fix",
          hash,
        },
        {
          subject: "docs(toml): complete documentation (#4223)",
          body: "",
          tag: "docs",
          hash,
        },
        {
          subject: "test(toml): improve test coverage (#4211)",
          body: "",
          tag: "test",
          hash,
        },
      ],
    },
    {
      module: "path",
      version: "patch",
      commits: [
        {
          subject:
            "deprecation(path): split off all constants into their own files and deprecate old names (#4153)",
          body: "",
          tag: "deprecation",
          hash,
        },
      ],
    },
    {
      module: "msgpack",
      version: "patch",
      commits: [
        {
          subject: "docs(msgpack): complete documentation (#4220)",
          body: "",
          tag: "docs",
          hash,
        },
      ],
    },
    {
      module: "media_types",
      version: "patch",
      commits: [
        {
          subject: "docs(media_types): complete documentation (#4219)",
          body: "",
          tag: "docs",
          hash,
        },
      ],
    },
    {
      module: "console",
      version: "patch",
      commits: [
        {
          subject:
            "refactor(console): rename `_rle` to `_run_length.ts` (#4212)",
          body: "",
          tag: "refactor",
          hash,
        },
      ],
    },
    {
      module: "fmt",
      version: "patch",
      commits: [
        {
          subject:
            "fix(fmt): correct `stripColor()` deprecation notice (#4208)",
          body: "",
          tag: "fix",
          hash,
        },
      ],
    },
    {
      module: "flags",
      version: "patch",
      commits: [
        {
          subject: "fix(flags): correct deprecation notices (#4207)",
          body: "",
          tag: "fix",
          hash,
        },
      ],
    },
    {
      module: "expect",
      version: "patch",
      commits: [
        {
          subject:
            "fix(expect): fix the function signature of `toMatchObject()` (#4202)",
          body: "",
          tag: "fix",
          hash,
        },
      ],
    },
    {
      module: "crypto",
      version: "patch",
      commits: [
        {
          subject:
            "chore(crypto): upgrade to `rust@1.75.0` and `wasmbuild@0.15.5` (#4193)",
          body: "",
          tag: "chore",
          hash,
        },
      ],
    },
    {
      module: "using",
      version: "patch",
      commits: [
        {
          subject:
            "refactor(using): use `using` keyword for Explicit Resource Management (#4143)",
          body: "",
          tag: "refactor",
          hash,
        },
      ],
    },
  ]);
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

Deno.test("tryGetDenoCongif()", async () => {
  const [_path, config] = await tryGetDenoConfig();
  assertEquals(config.name, denoJson.name);
});

Deno.test("getWorkspaceModules()", () => {
  // TODO(kt3k): set up fixture and write test.
});

Deno.test("applyVersionBump() updates the version of the given module", async () => {
  const appliedChange = await applyVersionBump(
    {
      module: "foo",
      version: "minor",
    },
    { name: "@scope/foo", version: "1.0.0", [pathProp]: "foo/deno.json" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.0.0",
        "scope/foo/": "jsr:@scope/foo@^1.0.0/",
        "scope/bar": "jsr:@scope/bar@^1.0.0",
        "scope/bar/": "jsr:@scope/bar@^1.0.0/"
      }
    }`,
    true,
  );
  assertEquals(appliedChange.oldVersion, "1.0.0");
  assertEquals(appliedChange.newVersion, "1.1.0");
  assertEquals(appliedChange.diff, "minor");
  assertEquals(
    appliedChange.denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^1.1.0",
        "scope/foo/": "jsr:@scope/foo@^1.1.0/",
        "scope/bar": "jsr:@scope/bar@^1.0.0",
        "scope/bar/": "jsr:@scope/bar@^1.0.0/"
      }
    }`,
  );
});

Deno.test("applyVersionBump() consider major bump for 0.x version as minor bump", async () => {
  const appliedChange = await applyVersionBump(
    {
      module: "foo",
      version: "major",
    },
    { name: "@scope/foo", version: "0.0.0", [pathProp]: "foo/deno.jsonc" },
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.0.0",
        "scope/foo/": "jsr:@scope/foo@^0.0.0/",
        "scope/bar": "jsr:@scope/bar@^1.0.0",
        "scope/bar/": "jsr:@scope/bar@^1.0.0/"
      }
    }`,
    true,
  );
  assertEquals(appliedChange.oldVersion, "0.0.0");
  assertEquals(appliedChange.newVersion, "0.1.0");
  assertEquals(appliedChange.diff, "minor");
  assertEquals(
    appliedChange.denoJson,
    `{
      "imports": {
        "scope/foo": "jsr:@scope/foo@^0.1.0",
        "scope/foo/": "jsr:@scope/foo@^0.1.0/",
        "scope/bar": "jsr:@scope/bar@^1.0.0",
        "scope/bar/": "jsr:@scope/bar@^1.0.0/"
      }
    }`,
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
