# ARR-11 Documentation Example — Snippets Mapping

This file is the explicit catalog required by ARR-10 implementation requirement #6 ("Make tests fail if README or generated examples import private `src/*` or `dist/*` paths") and extended by ARR-11 implementation requirement #4 ("Add documentation compile fixtures for representative basic, advanced projection, failure, and cancellation examples").

It records, for every TypeScript code block in the _installed_ README.md and the _website_ doc `website/docs/packages/access-router-react.md`, which extracted fixture compiles it. Blocks that are intentionally partial (a one-line concept snippet or a code fragment that cannot compile on its own) are listed as partial and are exercised through a larger embedded fixture so the names and option keys they reference still fail the compile if the public contract drifts.

ARR-10 established the README-only scope and the inventory format. ARR-11 extends the same harness — adding the website doc source path, additional representative fixtures (basic, advanced projection, failure/cancellation, Active Record integration), and a React 18 verification lane. The format is identical to the access-router-client ARC-20 mapping so cross-package inventory tooling can read both.

## Machine-readable block inventory

The compile gate reads this tab-separated inventory. `source` plus `ordinal` identifies a TypeScript fence in document order, and the full SHA-256 digest makes any content change require an explicit mapping review. `derived` means the fixture adds the declarations or surrounding context needed to compile the documented operation. `partial` and `negative` are explicit exclusions from standalone compilation; a fixture may still embed and compile their public API references.

```text docs-block-map
# source	ordinal	sha256	classification	fixture-or--
packages/access-router-react/README.md	1	13d6b3417a722fe066e466a2537349a49ca1803b341a1d3a7aad7aa9032cd82f	derived	setup.ts
packages/access-router-react/README.md	2	103f93b02b78ddbe83c0f69cf29aa56df867c3ff43a07296fe3f4955bdaa8436	derived	setup.ts
packages/access-router-react/README.md	3	1881192f326affe6b41859f741503dc2b72b140aa11445bdc660fae09903ee88	derived	quickstart.tsx
packages/access-router-react/README.md	4	abbc3ce00c20659be9699bd84c81b95e4c1b5eab1b491f4d0ee9f9872b981eb4	derived	query-hooks.tsx
packages/access-router-react/README.md	5	8eca6b0c516a8d5cbe05b504b58e91fcc034f9f49af72c4ee5a4802e8a1e01f2	derived	query-hooks.tsx
packages/access-router-react/README.md	6	f98b55a3f78d72e343570a0a70e243ce3332a09806b5327c2865af34211beb9a	derived	query-hooks.tsx
packages/access-router-react/README.md	7	f1af1c222bed9180d8c1a5cd40ab3acd5ebfa4194ffc02b927b4127b32978611	derived	query-hooks.tsx
packages/access-router-react/README.md	8	ca3fffd54e617645d5e04f9b8e822b54b3bddc6635ed2c9d7f0908a516a65611	derived	mutations.tsx
packages/access-router-react/README.md	9	59c0e1b34fb928835d34384676bfc699d20d784e3f19041ced2a103818ad4415	derived	mutations.tsx
packages/access-router-react/README.md	10	37ab3fd2b666d1ab3ecd4cf7ab2770e4b0a1bd31f53582b901d387a3921b88bf	derived	mutations.tsx
packages/access-router-react/README.md	11	646f6b1c2953479033272f9f371441a5546c99fc84289fc2482b6e5fc3f6399c	derived	mutations.tsx
packages/access-router-react/README.md	12	67b1249e4536f95b23df42796e823fc4d779ceb7fe3e4105bc843868da3424e7	derived	failure.tsx
packages/access-router-react/README.md	13	059211e38efee2ce3f2b008eda714271ff91aea9d43fb0612cbe4afb12402ea1	derived	cancellation.tsx
packages/access-router-react/README.md	14	7299e5efa26fbbe90ea014a1727c942faffde90e5f9dbeabe5cdc3d3224bd21c	derived	concurrent-mutations.tsx
packages/access-router-react/README.md	15	eaad23dc203844e15afbdb6f3e896aff91cb6a1f0c4c53c4d30410ed97f4c04f	derived	projection.tsx
packages/access-router-react/README.md	16	44a257c400ccafb0c44cd1bfd299f8f0ec86e411a775c974a0c0ee9698cf3368	partial	setup.ts
packages/access-router-react/README.md	17	34fcbb6e2d50311aa7ec2aa9e3d1afda7eb82b7a4f2fefdf46d8abd1c77730d0	derived	request-key.ts
website/docs/packages/access-router-react.md	1	13d6b3417a722fe066e466a2537349a49ca1803b341a1d3a7aad7aa9032cd82f	derived	website-extras.tsx
website/docs/packages/access-router-react.md	2	4a7e8c6c6ded7d603f5fae119a86eceb65e791eeec1a0ec6d57136fc7c17f87f	derived	website-extras.tsx
website/docs/packages/access-router-react.md	3	029df1acfa3970b766584ee52273f30e6e0284d3939be0ae81cafb553dcafcff	derived	query-hooks.tsx
website/docs/packages/access-router-react.md	4	c447d31717355ac46185bf4c0339a8f345d03da41e1a56736d3f87ccc855d9b9	derived	query-hooks.tsx
website/docs/packages/access-router-react.md	5	f98b55a3f78d72e343570a0a70e243ce3332a09806b5327c2865af34211beb9a	derived	query-hooks.tsx
website/docs/packages/access-router-react.md	6	1e6ede8d6dd419ab8cd942eb8f74ad82034b6e221fd46df9c3c15d2d92de9893	derived	website-extras.tsx
website/docs/packages/access-router-react.md	7	481bdf2588ad1075172e44c2300c363c1c2923d00d9d7fe04f912ea53a412cbc	derived	website-extras.tsx
website/docs/packages/access-router-react.md	8	59c0e1b34fb928835d34384676bfc699d20d784e3f19041ced2a103818ad4415	derived	mutations.tsx
website/docs/packages/access-router-react.md	9	37ab3fd2b666d1ab3ecd4cf7ab2770e4b0a1bd31f53582b901d387a3921b88bf	derived	mutations.tsx
website/docs/packages/access-router-react.md	10	646f6b1c2953479033272f9f371441a5546c99fc84289fc2482b6e5fc3f6399c	derived	mutations.tsx
website/docs/packages/access-router-react.md	11	059211e38efee2ce3f2b008eda714271ff91aea9d43fb0612cbe4afb12402ea1	derived	cancellation.tsx
website/docs/packages/access-router-react.md	12	7299e5efa26fbbe90ea014a1727c942faffde90e5f9dbeabe5cdc3d3224bd21c	derived	concurrent-mutations.tsx
website/docs/packages/access-router-react.md	13	989103c6aa7aa8b0c34c183621f54f9c3857898180385e454c2befb1d93be15d	partial	projection.tsx
website/docs/packages/access-router-react.md	14	3781be8976c15db45c4f3b648f1b25b91012ed3ec92963ccceb9be7c17c67a5e	derived	request-key.ts
website/docs/packages/access-router-react.md	15	0524d8b7734516cb7e2ade1f3927e772756fcba2cf1dd7221120d2e10e40c1c5	derived	active-record.tsx
```
