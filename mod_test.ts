// Copyright 2024 the Deno authors. All rights reserved. MIT license.

import { assertSnapshot } from "@std/testing/snapshot";
import { copy, exists } from "@std/fs";
import { bumpWorkspace } from "./mod.ts";
import { join } from "@std/path";
import { tryGetDenoConfig } from "./util.ts";
import { assert, assertEquals } from "@std/assert";

// Note: The test cases in this file use git information in the branch `origin/base-branch-for-testing`.

Deno.test("bumpWorkspaces()", async (t) => {
  const dir = await Deno.makeTempDir();
  await copy("testdata/basic", dir, { overwrite: true });
  await bumpWorkspace({
    dryRun: "git",
    githubRepo: "denoland/deno_std",
    githubToken: "1234567890",
    base: "origin/base-branch-for-testing",
    start: "start-tag-for-testing",
    root: dir,
  });

  const releaseNote = await Deno.readTextFile(join(dir, "Releases.md"));
  await assertSnapshot(
    t,
    releaseNote.replace(/^### \d+\.\d+\.\d+/, "### YYYY.MM.DD"),
  );

  let _, config;
  [_, config] = await tryGetDenoConfig(dir);
  assertEquals(config, {
    imports: {
      "@scope/foo": "jsr:@scope/foo@^2.0.0",
      "@scope/foo/": "jsr:@scope/foo@^2.0.0/",
      "@scope/bar": "jsr:@scope/bar@^2.3.5",
      "@scope/bar/": "jsr:@scope/bar@^2.3.5/",
      "@scope/baz": "jsr:@scope/baz@^0.2.4",
      "@scope/baz/": "jsr:@scope/baz@^0.2.4/",
      "@scope/qux": "jsr:@scope/qux@^0.3.5",
      "@scope/qux/": "jsr:@scope/qux@^0.3.5/",
      "@scope/quux": "jsr:@scope/quux@^0.1.0",
      "@scope/quux/": "jsr:@scope/quux@^0.1.0/",
    },
    workspace: ["./foo", "./bar", "./baz", "./qux", "./quux"],
  });
  [_, config] = await tryGetDenoConfig(join(dir, "foo"));
  assertEquals(config, {
    name: "@scope/foo",
    version: "2.0.0",
  });
  [_, config] = await tryGetDenoConfig(join(dir, "bar"));
  assertEquals(config, {
    name: "@scope/bar",
    version: "2.3.5",
  });
  [_, config] = await tryGetDenoConfig(join(dir, "baz"));
  assertEquals(config, {
    name: "@scope/baz",
    version: "0.2.4",
  });
  [_, config] = await tryGetDenoConfig(join(dir, "qux"));
  assertEquals(config, {
    name: "@scope/qux",
    version: "0.3.5",
  });
  [_, config] = await tryGetDenoConfig(join(dir, "quux"));
  assertEquals(config, {
    name: "@scope/quux",
    version: "0.1.0",
  });
});

Deno.test(
  "bumpWorkspaces() doesn't write things when dry run specified",
  async () => {
    const dir = await Deno.makeTempDir();
    await copy("testdata/basic", dir, { overwrite: true });
    await bumpWorkspace({
      dryRun: true,
      githubRepo: "denoland/deno_std",
      githubToken: "1234567890",
      base: "origin/base-branch-for-testing",
      start: "start-tag-for-testing",
      root: dir,
    });

    assert(!(await exists(join(dir, "Releases.md"))));

    const [_, config] = await tryGetDenoConfig(dir);
    assertEquals(config, {
      imports: {
        "@scope/foo": "jsr:@scope/foo@^1.2.3",
        "@scope/foo/": "jsr:@scope/foo@^1.2.3/",
        "@scope/bar": "jsr:@scope/bar@^2.3.4",
        "@scope/bar/": "jsr:@scope/bar@^2.3.4/",
        "@scope/baz": "jsr:@scope/baz@^0.2.3",
        "@scope/baz/": "jsr:@scope/baz@^0.2.3/",
        "@scope/qux": "jsr:@scope/qux@^0.3.4",
        "@scope/qux/": "jsr:@scope/qux@^0.3.4/",
        "@scope/quux": "jsr:@scope/quux@^0.0.0",
        "@scope/quux/": "jsr:@scope/quux@^0.0.0/",
      },
      workspace: ["./foo", "./bar", "./baz", "./qux", "./quux"],
    });
  },
);
