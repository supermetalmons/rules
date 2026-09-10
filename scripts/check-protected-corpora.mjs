#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { posix, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");

const protectedFiles = Object.freeze({
  "test-data/rules-regressions.jsonl.gz":
    "02942e8107a3de160cfa1bf99dc6d1bcc070c94ba4aca650cb0c67530ee2e280",
  "test-data/automove-decisions/v1/README.md":
    "b163876a3763d6904d720ac0f0468eaae01554252ab40233b6965c59d071161a",
  "test-data/automove-decisions/v1/decisions.jsonl":
    "0ca2d5e5c619f24da155da5b70c20707f963a47235e74a0857eed128ab429f67",
  "test-data/automove-decisions/v1/internal-selector-observations.txt":
    "f6e52b3e4cf112e6e36f36776e7d587f491b46d169ff0df9fa1070651a04e324",
  "test-data/automove-decisions/v1/manifest.json":
    "70f9aae306523880b82874543517bc407b0897d16f344385da8ba4d31ccfaade",
  "test-data/automove-decisions/v4/README.md":
    "5fbd0d59891e3bd0823b60c30381fcb388c056f5e4351ce7f85c447b5ebc8f68",
  "test-data/automove-decisions/v4/decisions.jsonl":
    "96bc554ccd66d398ee79f031383a9dfadc96924df89c94a770714351fb22d02d",
  "test-data/automove-decisions/v4/manifest.json":
    "b9b9c74dfa1054265d9ae3865ac0cc7ba25ef633613f1898b51f237c5a6b717d",
  "test-data/automove-decisions/v5/README.md":
    "9002732736bd38b414130d92995cbc8e6f4b675d758ba033dc9ad4ef1ea05608",
  "test-data/automove-decisions/v5/decisions.jsonl":
    "3c791d84e230c967d2530fc1f1828020ded06cf44d8e5f6696bafd23e1672836",
  "test-data/automove-decisions/v5/manifest.json":
    "b84f009152dcce737e470dc6c7d2615277fb0859d3168aeffd08a26c7d17659d",
  "test-data/automove-decisions/v6/README.md":
    "e55750af545c7e36b8b325bda769095c2e3f11819237ad81f42496285ee1586a",
  "test-data/automove-decisions/v6/decisions.jsonl":
    "32799d75bebfe49494770af1657ff232208244081f7eafe9adaa606b1a251ee1",
  "test-data/automove-decisions/v6/manifest.json":
    "927b750a1e0cefdca99352aa956543770d6c9ef6a991256b9235971c4821a01b",
  "test-data/automove-decisions/v7/README.md":
    "f8f908bf36787ddaa3264b15806b07d6cc6d42639f08e7f258a6fd29d0d9d56e",
  "test-data/automove-decisions/v7/decisions.jsonl":
    "cfeb7612a3d5db3bcb348e38baab7aff8908575ee3eccc309e8d7dbbbeeaf61d",
  "test-data/automove-decisions/v7/manifest.json":
    "3a830a1d4e4d3ecb5f1f53f0c0999fb8740259b231727143889dc545aa5296d7",
  "test-data/automove-decisions/v8/README.md":
    "9eefc9d9692947667f02721f1e0985d0c85af50fa73f53b9e9421752b7a1a7c7",
  "test-data/automove-decisions/v8/decisions.jsonl":
    "35f6160277f48ae6c9ea71d50cb25287def753961d4e42f1b996e7948cca50c6",
  "test-data/automove-decisions/v8/manifest.json":
    "083375e18fc72c06b93be0e0b2681799d06ff96a53b131761c47575f34299a14",
  "test-data/automove-decisions/v9/README.md":
    "2565e4b3537bed62f91b4971ee564a0688cd72d374b6b89dca39eece68341222",
  "test-data/automove-decisions/v9/decisions.jsonl":
    "bbf58923bc145c037eee5015d2285e2adbc36d02adb133cb58c1124d62d24bbc",
  "test-data/automove-decisions/v9/manifest.json":
    "f9ae7a15e2d4e047202661ae34d5185374f261ba7e2746d5713588e74bfa92a8",
  "test-data/automove-decisions/v10/README.md":
    "f27af47fcd7507b40dd511b726f944019c3523f6f83c8215acb12ad1bc52021f",
  "test-data/automove-decisions/v10/decisions.jsonl":
    "4e48a68b82f4756e417308d72d9f82160af87b549f1014663aed37560116ecb4",
  "test-data/automove-decisions/v10/manifest.json":
    "4a9c48d8d1cdf11d304c65fda202d26ff82cd0f1128fb8cbdfafc50b87889c8d",
  "test-data/automove-decisions/v11/README.md":
    "d7fb964ec62a0f3c391affff4bc89b7f4df9ad075a4e2f7b6ff26af7e251b5a5",
  "test-data/automove-decisions/v11/decisions.jsonl":
    "b06ea4e7ced64092adf08769cffcf4c55a3239ecd951a205a5c58a23c2370762",
  "test-data/automove-decisions/v11/manifest.json":
    "f8f41850be426b4eaad946139dba17f80d59506ba4de60e6f8d8755e137a2e0a",
  "test-data/automove-decisions/v12/README.md":
    "4ff6d73e6ee56a8c6efe9a7c68de4ba42a2fb9a7fa61434bf8f5efa55537e203",
  "test-data/automove-decisions/v12/decisions.jsonl":
    "c3c1825cde5af6907db77c25adac4993dbc16eec513d3d22bc813a31d123ca5a",
  "test-data/automove-decisions/v12/manifest.json":
    "96c51a8ce9d9efcd32e3c14d3ab998e6439bb9f2e482b41b095608648ed94dc4",
  "test-data/automove-decisions/v13/README.md":
    "63c3efaadb7deb2a30751cd5484d2ac712bb63de43dddd58c0e067c5019601b1",
  "test-data/automove-decisions/v13/decisions.jsonl":
    "12beed8845b63ef49fa82df4939a6712546ed6dce3460e4ab8e8c632b81c23d2",
  "test-data/automove-decisions/v13/manifest.json":
    "3e11e2b9a615b7c87c1f3a55791c869aff5c7eaccf08f804f4afc7f61a6984b7",
  "test-data/automove-decisions/v14/README.md":
    "2724f3e3a642e418039d8717da594719ac23bca56266b9836e5b43110ed7e1c5",
  "test-data/automove-decisions/v14/decisions.jsonl":
    "490bc4bab4428a757821774de2271c408eb8411fabed51cc066d8e34e659c48a",
  "test-data/automove-decisions/v14/manifest.json":
    "95b7e086a57c0813c1c502c37146669f8dcf1b935db8be0ba93d1f2d13a5a4f4",
  "test-data/automove-decisions/v15/README.md":
    "a11ea4766d2f70003b70c34fae3ef2790316ec1f8df139c4795396b774aaa0a7",
  "test-data/automove-decisions/v15/decisions.jsonl":
    "47f44394f6bf5394bf88a347a92ac18e3a02757abbb3240d7cb422e10146e355",
  "test-data/automove-decisions/v15/manifest.json":
    "5cb0f6edb2d8da42218ce6570dc6c97870116a62823b5371a894bf60f67bf4d7",
  "test-data/automove-decisions/v16/README.md":
    "6c9643b5f55cabff1b5aa998c9894414acc32762bf528233fe80a409478b3033",
  "test-data/automove-decisions/v16/decisions.jsonl":
    "ab738696d41ea0f019c2e160f9f991cb348056a74fc3e23ee580d0ac1947bd04",
  "test-data/automove-decisions/v16/manifest.json":
    "add6fa8ec045a1881ea577c64d323da1119fe41f1f968642da8cb541a72182dd",
  "test-data/automove-decisions/v17/README.md":
    "b793d69917d32742e819800f9470ce8d83bb629dcfe7613e31ba7ed122a0241b",
  "test-data/automove-decisions/v17/decisions.jsonl":
    "095e682c91cd4e34ce9f727f1f5a930a10bf8ae7376af0c074fca76fb5f47e0d",
  "test-data/automove-decisions/v17/manifest.json":
    "f0c2e701135e0ad5603ef518f0aff184ab777679e197fbebbab4f4dbd14aa35a",
  "test-data/automove-decisions/v18/README.md":
    "710b179cc2b3bb6b9b662db7e9f7cc668040e2230f813aea37dab346045448f7",
  "test-data/automove-decisions/v18/decisions.jsonl":
    "095e682c91cd4e34ce9f727f1f5a930a10bf8ae7376af0c074fca76fb5f47e0d",
  "test-data/automove-decisions/v18/manifest.json":
    "a6f3758c6abc7af2dcb43517c2fe6af7299680b9a86ff814f81bfbadfdfa7ee1",
  "test-data/compatibility-edge-cases/v1/coordinate-cases.jsonl":
    "bc5f2b96f4755cd3c4e2d45f8b5b1753d56c27a7947d572c6956db3e85ddad66",
  "test-data/compatibility-edge-cases/v1/fen-cases.jsonl":
    "c4e2ad67d54bdb83e4e0f0310783e8f2043d82f9f93448ef9e885b1e54529304",
  "test-data/compatibility-edge-cases/v1/manifest.json":
    "c2926d59ed23d766b17d9a95cf169f5298d0db2c6b9ed19ab5ffb2a08b6d2b3f",
  "test-data/compatibility-edge-cases/v1/string-cases.jsonl":
    "70d1adc75a3d3b0ec014ff79cf08c95948c98117adc53f2304f497394de2ef3f",
  "test-data/complete-games/v1/README.md":
    "53e6d140aa928a7468f4271cd62fd2f569d45cce7955f27e6bf40bfe1cd61a39",
  "test-data/complete-games/v1/complete-games.jsonl":
    "5bc194f15516a9c275807415910c95b2e62ce63df9e575ac93e1dd93013197eb",
  "test-data/complete-games/v1/manifest.json":
    "7002d2fab95f311cc27c34ff588f5d1d94685ffd5b6212936375fe86f7527fe9",
  "test-data/automove-decisions/v19/README.md":
    "cf15428913d9dbb29c7d22c952895bbd167f670481565df39429aa9463cb891a",
  "test-data/automove-decisions/v19/decisions.jsonl":
    "4e31760134f262f9e1d8e35b8111066c3be05fd8a82e5b05b822d6e48e0b03c4",
  "test-data/automove-decisions/v19/manifest.json":
    "1eac5e2825a2081258abb7e689bba673e3cd57fa6d188e846c6d6bb554ca85b0",
});

const protectedDirectories = Object.freeze(
  [
    ...new Set(
      Object.keys(protectedFiles)
        .map((relativePath) => posix.dirname(relativePath))
        .filter((directory) => directory !== "test-data"),
    ),
  ].sort(),
);

async function listFiles(relativeDirectory) {
  const files = [];
  const directories = [relativeDirectory];
  while (directories.length > 0) {
    const directory = directories.pop();
    const entries = await readdir(resolve(repositoryRoot, directory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  return files.sort();
}

const failures = [];

for (const directory of protectedDirectories) {
  const expected = Object.keys(protectedFiles)
    .filter((relativePath) => relativePath.startsWith(`${directory}/`))
    .sort();
  const actual = await listFiles(directory);
  if (
    actual.length !== expected.length ||
    actual.some((relativePath, index) => relativePath !== expected[index])
  ) {
    failures.push(
      `${directory}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

for (const [relativePath, expectedHash] of Object.entries(protectedFiles)) {
  const bytes = await readFile(resolve(repositoryRoot, relativePath));
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) {
    failures.push(`${relativePath}: expected ${expectedHash}, got ${actualHash}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Protected corpus integrity check failed:\n${failures.join("\n")}`);
}

console.log(
  `Protected corpus integrity check passed (${Object.keys(protectedFiles).length} files).`,
);
