## [0.4.0](https://github.com/egose/web-ts-toolkit/compare/v0.3.0...v0.4.0) (2026-05-28)

### Features

* implement library-agnostic request validation ([c0b25e5](https://github.com/egose/web-ts-toolkit/commit/c0b25e5655f82f6acd89332331703a37ed57c006))

### Refactors

* **access-router-client:** simplify lazy request types with ModelRequest and DataRequest aliases ([b2288af](https://github.com/egose/web-ts-toolkit/commit/b2288af6e581c3a9f6c8ae778d9bab3d48860139))

## [0.3.0](https://github.com/egose/web-ts-toolkit/compare/v0.2.0...v0.3.0) (2026-05-27)

### Features

* **access-router-client:** enhance lazy promise and error response parsing ([f127274](https://github.com/egose/web-ts-toolkit/commit/f1272744f4beb29dbe5a31b2092fdad77154ac74))
* **access-router-client:** enhance Model with state management and utility methods ([9c4f526](https://github.com/egose/web-ts-toolkit/commit/9c4f5264f148496c2edbf2210a4ab49164cbad65))
* **access-router-client:** improve request caching, grouping and sub-document queries ([fc4312c](https://github.com/egose/web-ts-toolkit/commit/fc4312c0f26aedc5c5f371092e88617640b0a29a))
* **access-router-client:** infer selected field types in advanced queries ([65a57fa](https://github.com/egose/web-ts-toolkit/commit/65a57faec050459d000d7a7c9283b110909431b1))
* **access-router-client:** update default root router path and usage documentation ([6a8d4fc](https://github.com/egose/web-ts-toolkit/commit/6a8d4fc34ae92ee48f2cbca0a1cd63259def36f3))
* **access-router-nodejs-sample:** add MongoDB model router demo ([5268829](https://github.com/egose/web-ts-toolkit/commit/52688296e7b6ff7db92702602ad5627788a1c3e9))
* **access-router-nodejs-sample:** add nodejs sample application ([ef190cd](https://github.com/egose/web-ts-toolkit/commit/ef190cdffbd83821fd9b589925df4dcccc082c25))
* **access-router:** implement isolated runtime support across options and routers ([62a1a94](https://github.com/egose/web-ts-toolkit/commit/62a1a9435e5b722360c04c41df40923914b7c7e5))
* **access-router:** introduce AccessRuntime and async context storage ([2afab5d](https://github.com/egose/web-ts-toolkit/commit/2afab5db14923e1ca123b47c85d5d62631bb87db))
* add access-router-client package ([5664220](https://github.com/egose/web-ts-toolkit/commit/56642204c5085f78fc0b72bbcfd8d2aac1056c12))
* add combineRoutes utility to merge multiple routers ([ade35d3](https://github.com/egose/web-ts-toolkit/commit/ade35d306b8fabe8c6e7d2d6e340a9457776363e))
* add data target support and enhanced batch processing to root router ([69023fc](https://github.com/egose/web-ts-toolkit/commit/69023fcf40c14fc3ac0352f5111e1e65ad54cf9a))
* add generic support for typed routers and services ([6efeef7](https://github.com/egose/web-ts-toolkit/commit/6efeef75fe2890ff44b9c6cfe742b16eec00b79c))
* add mapValues utility ([7323666](https://github.com/egose/web-ts-toolkit/commit/732366621f726090bb576f1a976016f0313d6f24))
* add operation and query metadata to hook contexts ([9479c1b](https://github.com/egose/web-ts-toolkit/commit/9479c1be21f99f158a2eeac864794dad11bb13af))
* add shared utility functions ([ad52723](https://github.com/egose/web-ts-toolkit/commit/ad52723daee3e83d84780ac2d1a01fe76599488c))
* add sub-document operations to root batch router ([b442155](https://github.com/egose/web-ts-toolkit/commit/b442155188e7e9267358e9f76b4229e110b5d94d))
* add upsert capability to public service and model router ([027dbb5](https://github.com/egose/web-ts-toolkit/commit/027dbb57bb0fc0296ffacc7efbf47d878de7b17c))
* implement immutable router options and advanced subpath export ([073f246](https://github.com/egose/web-ts-toolkit/commit/073f24667035b2d294e764de527f52e482a8dcf8))
* improve type safety for router options and hooks ([a750640](https://github.com/egose/web-ts-toolkit/commit/a7506402db832254e0b1bc595b5e0fed62b1524a))
* initialize docusaurus documentation site and migrate package content ([94edd06](https://github.com/egose/web-ts-toolkit/commit/94edd0694fab0dffb6547936d02aad04bedc974a))
* migrate nodejs sample to typed api and demonstrate augmentation ([e936b18](https://github.com/egose/web-ts-toolkit/commit/e936b1888054d3216556b7dcdf11e87378ee2069))
* **nodejs-sample:** add batch router and update permission syntax ([31c44e3](https://github.com/egose/web-ts-toolkit/commit/31c44e3c65ad9977aa5839c3fd5a9bfeeffb6ade))
* redesign permission class with method-based access ([f197f06](https://github.com/egose/web-ts-toolkit/commit/f197f06c3fa3dd46dbb9c5938a93918a7064e252))
* refine API schemas, tighten validation, and add update permissions ([1152b35](https://github.com/egose/web-ts-toolkit/commit/1152b3548903023a80d3e5e9d0bf98c0f9905669))
* rename configuration options for clarity ([eef1eac](https://github.com/egose/web-ts-toolkit/commit/eef1eac8789486ed02901c098527bb7334c71ea8))
* rename finalize hook to afterPersist and add delete lifecycle hooks ([e3f8261](https://github.com/egose/web-ts-toolkit/commit/e3f8261fc0eb238aae18125ea5f7b41e20c7e0f8))
* simplify delete hooks and remove DeleteAccess abstraction ([9d9e980](https://github.com/egose/web-ts-toolkit/commit/9d9e980cb4e9ab9fe8a420dba256b271c1e6da79))
* update user router configuration with simplified filter and afterDelete hook ([2c68acf](https://github.com/egose/web-ts-toolkit/commit/2c68acf4dcd3b57bd2ad3f079e26406e6ca7912b))
* use combineRoutes for mounting routers in nodejs sample ([fb03675](https://github.com/egose/web-ts-toolkit/commit/fb03675af1d4e5bfdc4a9145da640c61770bc8dc))

### Bug Fixes

* **access-router:** validate mongoose model existence in root operations ([e629faf](https://github.com/egose/web-ts-toolkit/commit/e629faf4c5209457e72e5977be06576d6cc0bc3c))

### Docs

* **access-router:** add architecture roadmap ([cdc17da](https://github.com/egose/web-ts-toolkit/commit/cdc17daab8614f58cf7635de4d8160338f4a8383))
* **access-router:** mark ACL consolidation phase as completed in roadmap ([602b145](https://github.com/egose/web-ts-toolkit/commit/602b145201d22b85b21fc5c41c86429b7f77ef31))
* **access-router:** update architecture roadmap status ([9313907](https://github.com/egose/web-ts-toolkit/commit/93139079cc597bc213a152fe6c169538788c0a7b))
* **access-router:** update roadmap with phase 3 completion ([6fc3cd8](https://github.com/egose/web-ts-toolkit/commit/6fc3cd87d6f87a04f1cd4d21f0b6a67f3875f6b9))
* add typescript documentation and usage examples ([a8c85d7](https://github.com/egose/web-ts-toolkit/commit/a8c85d75170f73c8c1182a5fa5d7ad58fe37b39a))
* expand and split access-router documentation into multi-page guide ([53675b6](https://github.com/egose/web-ts-toolkit/commit/53675b6018eca43b1ba548ea122165d15b13ae9e))
* update access-router documentation ([176430f](https://github.com/egose/web-ts-toolkit/commit/176430fcb2ab51986868ccbe1911cabfc77ce2ec))
* update architecture roadmap and package documentation ([3400171](https://github.com/egose/web-ts-toolkit/commit/3400171b86c70e6bc9ea8e75fbca0cd280b35dcd))
* update architecture roadmap with phase 1 completion status ([666517a](https://github.com/egose/web-ts-toolkit/commit/666517a9ded475ea49ce853a50e4e83bf3eaa48e))
* update hook context field documentation ([e31447c](https://github.com/egose/web-ts-toolkit/commit/e31447cfba04094c9846a5560afe562ee7319b63))
* **website:** add access-router-client package documentation ([583735b](https://github.com/egose/web-ts-toolkit/commit/583735b7d041fb77ce3e4007bfa01f1e210c4d4f))
* **website:** add documentation for access-router-client package ([e9b118f](https://github.com/egose/web-ts-toolkit/commit/e9b118fde90ee640df69678ca5e2bc3dc7439599))

### Refactors

* **access-router-client:** extract shared service utilities ([9eabed9](https://github.com/egose/web-ts-toolkit/commit/9eabed9cbc0ecf17b943ee883447a8d2500b3faf))
* **access-router-client:** improve type safety and internal implementations ([a71f301](https://github.com/egose/web-ts-toolkit/commit/a71f301343f9ed6ac3e47f96aa76af475d539a71))
* **access-router-client:** remove unused set import ([d2dc942](https://github.com/egose/web-ts-toolkit/commit/d2dc94280fafcdeda358c07792ace46a7f2c6141))
* **access-router-client:** simplify advanced read request payloads in DataService ([0e78338](https://github.com/egose/web-ts-toolkit/commit/0e783382716e7c90b8ec74b375fe3c525f9f4edb))
* **access-router:** centralize service argument and option resolution ([54d2ae4](https://github.com/egose/web-ts-toolkit/commit/54d2ae4a47231f43697764f7717de5e1756dc33e))
* **access-router:** extract argument resolution and subdocument logic to dedicated modules ([81d850b](https://github.com/egose/web-ts-toolkit/commit/81d850b8efddba9aade1f185727c28397d84f503))
* **access-router:** extract shared ACL logic into specialized modules ([aa7d065](https://github.com/egose/web-ts-toolkit/commit/aa7d065177220e73cfaac23a39e2470f79727084))
* **access-router:** extract shared response pipeline helpers ([d7e92d7](https://github.com/egose/web-ts-toolkit/commit/d7e92d7e8f6fdd25b45da3064a177e3d2372da09))
* **access-router:** migrate routers to use shared response pipelines ([717a1e6](https://github.com/egose/web-ts-toolkit/commit/717a1e6954a2234d37a9aab969e1515728f62450))
* **access-router:** rename middleware terminology to hooks ([34c7036](https://github.com/egose/web-ts-toolkit/commit/34c7036995da7cec69cd9efa349830ef00ce06a9))
* **access-router:** reorganize interfaces into focused modules ([e8ebbcd](https://github.com/egose/web-ts-toolkit/commit/e8ebbcd2333d6349e90313fc40f0fab0881c50ac))
* **access-router:** split model-router into operation-specific modules ([70a4782](https://github.com/egose/web-ts-toolkit/commit/70a4782c754ae73e036e187dd2d6b700ecc9d835))
* **access-router:** split validation logic into domain-specific modules ([2f70248](https://github.com/egose/web-ts-toolkit/commit/2f7024842f404791ec7c39b43ee1f5b3e4ac081d))
* distinguish between model and data request types ([f040a92](https://github.com/egose/web-ts-toolkit/commit/f040a922526b65c383a82423496876a09b642d38))
* format code style and imports ([c6337c5](https://github.com/egose/web-ts-toolkit/commit/c6337c54154724344a1aa9ce7d8a55dcba5d7563))
* improve type safety for router option setters with generics ([b855894](https://github.com/egose/web-ts-toolkit/commit/b85589468249fbf3501bb49a74864613dbaec7c0))
* narrow public API surface and migrate low-level exports to advanced subpath ([417f901](https://github.com/egose/web-ts-toolkit/commit/417f901f5ee7b2e97581e4acb7bfb0a2a605c7ae))
* rename hook contexts and enforce document instances in lifecycle hooks ([6dde902](https://github.com/egose/web-ts-toolkit/commit/6dde9020703622404d5d798c7d49f1d12efd512d))
* rename internal router and service modules for clarity ([90507ec](https://github.com/egose/web-ts-toolkit/commit/90507ec272c1cd9e03a77c62a7459d49dd2cc3e2))
* use shared utilities from utils package ([5cbc333](https://github.com/egose/web-ts-toolkit/commit/5cbc33388ddb48c6d49f9c09f560b07ad96d7bb4))

## [0.2.0](https://github.com/egose/web-ts-toolkit/compare/v0.1.0...v0.2.0) (2026-05-12)

### Features

* **access-router:** add custom logger support and rebranding updates ([2089f04](https://github.com/egose/web-ts-toolkit/commit/2089f0417ac1b723f3a4fcf6f57861a650896c8e))
* **access-router:** add request validation schemas and utilities ([2aa52f2](https://github.com/egose/web-ts-toolkit/commit/2aa52f224622a2f0cec88c38d0e83edb1a8aa357))
* **access-router:** enforce request validation in routers ([253021f](https://github.com/egose/web-ts-toolkit/commit/253021f7a37e40939db08d49b608ad0a532e07fe))
* **access-router:** implement client filter validation and normalization ([82eac96](https://github.com/egose/web-ts-toolkit/commit/82eac96ef2b449b50816d6c423782dad80613e39))
* **access-router:** optimize and deduplicate filter merging ([cfd796e](https://github.com/egose/web-ts-toolkit/commit/cfd796eef3debd4f75170a916802a62e2c9909f6))
* **access-router:** rename acl package to access-router ([cb7a6fc](https://github.com/egose/web-ts-toolkit/commit/cb7a6fcf279e0c671f6cb1a56094c63760976cf7))
* **access-router:** standardize list response envelope and pagination headers ([638668d](https://github.com/egose/web-ts-toolkit/commit/638668de65787b0a406ce00f084e403ca880115a))
* **access-router:** support user-defined request schemas for route validation ([19fed1f](https://github.com/egose/web-ts-toolkit/commit/19fed1fb32ae787b4e4d48b212ba8a0117723723))
* **acl:** add ACL router and service package for Express and Mongoose APIs ([8894d4a](https://github.com/egose/web-ts-toolkit/commit/8894d4aaa7dec59aaa64d06d058a1322835814c7))
* **acl:** optimize model metadata discovery and enhance query validation ([96990de](https://github.com/egose/web-ts-toolkit/commit/96990deaa3244c384bde75ff8011b857c0035623))
* add @web-ts-toolkit/utils package ([7c58c5f](https://github.com/egose/web-ts-toolkit/commit/7c58c5f0aa262e5ecf03b976d78793a6a34e1435))
* add addLeadingSlash, isPromise, and toStringRecord utilities ([c894feb](https://github.com/egose/web-ts-toolkit/commit/c894febba35bf49a26b18478f970faad5355635e))
* add rfc9457ContentType option to handler ([a3dfc1a](https://github.com/egose/web-ts-toolkit/commit/a3dfc1acada8c63732386d962246a7dea9a8a423))
* adopt RFC 9457 error format and shared helpers ([0b54759](https://github.com/egose/web-ts-toolkit/commit/0b54759d97f9220fc3a264e000561ec482f49048))
* **express-json-router:** allow custom response handler instances for structured error formats ([d570ad1](https://github.com/egose/web-ts-toolkit/commit/d570ad18c08f88a165c859f53358cb2581ce5142))
* **express-response-handler:** add RFC 9457 error format support ([56adfe3](https://github.com/egose/web-ts-toolkit/commit/56adfe3b9c6e2c7535926c7e03beb49bc37907bb))
* **express-response-handler:** rename factory to createHandler and expand public exports ([1e280b2](https://github.com/egose/web-ts-toolkit/commit/1e280b24d2dde0f5077e0bf887324d354b632cf6))
* **http-errors:** add RFC 9457 support ([e9af2d8](https://github.com/egose/web-ts-toolkit/commit/e9af2d8780552f2a4a82a76c3b4a12d59dc84771))

### Bug Fixes

* **access-router:** preserve model overrides and improve permission classification ([abcd2a8](https://github.com/egose/web-ts-toolkit/commit/abcd2a81b24955648302b9c3addac7b2b9445a1b))

### Docs

* **access-router:** add hook signatures and examples to README ([1cadc21](https://github.com/egose/web-ts-toolkit/commit/1cadc219f83a3f2f52f82ad1515d995581653f91))

### Refactors

* **access-router:** clean up unused imports and dead code ([c2268db](https://github.com/egose/web-ts-toolkit/commit/c2268dbcc1effc1990cdfcb45db74963fa42f1aa))
* **access-router:** extract assertAllowed helper and clean up routers ([5a7306c](https://github.com/egose/web-ts-toolkit/commit/5a7306c78936aa238e5fcd5cd08caa6f749b8c1f))
* **access-router:** extract nested option resolution utility ([4e72e28](https://github.com/egose/web-ts-toolkit/commit/4e72e28a028a03228197134a1f0917ac3db4d5ea))
* **access-router:** improve type safety and remove ts-nocheck in core modules ([3510e5d](https://github.com/egose/web-ts-toolkit/commit/3510e5d5151fbb372fadf9ead69f2ad614e9bfa0))
* **access-router:** improve type safety and replace any with unknown ([7cfc4ac](https://github.com/egose/web-ts-toolkit/commit/7cfc4ac8fef537a677f793deec2abcdef325beb5))
* **access-router:** improve type safety with explicit definitions and generics ([43c1563](https://github.com/egose/web-ts-toolkit/commit/43c1563550e780890a1c4efd74c53d1fa6d5029c))
* **access-router:** refactor ServiceResult as discriminated union for better type safety ([54c018b](https://github.com/egose/web-ts-toolkit/commit/54c018b778b20736a15b93b44248401f0c86b950))
* **acl:** extract shared core and router logic and standardize permission field naming ([c9ba57d](https://github.com/egose/web-ts-toolkit/commit/c9ba57ddf70d6edfc4ca4e7811f8b5dea9bde8f2))
* **acl:** simplify baseFilter retrieval logic ([a34e1ee](https://github.com/egose/web-ts-toolkit/commit/a34e1ee86f506e4df0d3a66df6ed9c728d9be026))
* consolidate redundant utility implementations across packages ([35744b6](https://github.com/egose/web-ts-toolkit/commit/35744b6ad88afb6c4067afb678773748be360658))
* enhance type safety in core logic and services ([65c1df2](https://github.com/egose/web-ts-toolkit/commit/65c1df29e984229ba073ee2758bcee7be829d66a))
* improve type definitions for collection utilities ([fa14c49](https://github.com/egose/web-ts-toolkit/commit/fa14c4988080b5f0f7f2479e7b5e023abf48d0e5))
* **moo:** extract shared utils and simplify plugin internals ([b7176e0](https://github.com/egose/web-ts-toolkit/commit/b7176e0885f4243fc7404c72890bed243e235d5c))
* replace lodash with @web-ts-toolkit/utils in access-router ([35f8c1d](https://github.com/egose/web-ts-toolkit/commit/35f8c1d727b4288deb7c65df234c0bbafa826e00))

## [0.1.0](https://github.com/egose/web-ts-toolkit/compare/v0.0.2...v0.1.0) (2026-05-03)

### Features

* add express-json-router package ([a620fb1](https://github.com/egose/web-ts-toolkit/commit/a620fb1b0108c6df27f3a24689702f9e93f2b03c))
* add moo package with mongoose helpers and plugins ([6118f36](https://github.com/egose/web-ts-toolkit/commit/6118f365c2fd3b1fa82619d5b530612b0702758b))

### Refactors

* explicitly define route methods in JsonRouter ([ba531ae](https://github.com/egose/web-ts-toolkit/commit/ba531aee3caed9fd828d06a2735ecfcbda08b1c7))
* improve type safety and clean up code in moo ([e4bd12f](https://github.com/egose/web-ts-toolkit/commit/e4bd12f4829d902a93e82db60765c20dcac71ca8))
* update express-response-handler import paths ([2fdd603](https://github.com/egose/web-ts-toolkit/commit/2fdd603fccc72bcd28199d1a9b8dfe4ae624ed7b))

## [0.0.2](https://github.com/egose/web-ts-toolkit/compare/v0.0.1...v0.0.2) (2026-05-03)

## [0.0.1](https://github.com/egose/web-ts-toolkit/compare/a4d2fb96f53403a14d87906f11473f01c16e22c6...v0.0.1) (2026-05-03)

### Features

* add http-errors package ([a4d2fb9](https://github.com/egose/web-ts-toolkit/commit/a4d2fb96f53403a14d87906f11473f01c16e22c6))
* add workspace publishing script and CI workflow ([f431ac2](https://github.com/egose/web-ts-toolkit/commit/f431ac2bb95ad2e1c027b1cb733aface9e427f6e))
* setup eslint and add lint job to ci ([c0c77ef](https://github.com/egose/web-ts-toolkit/commit/c0c77ef335819b382a43e95ca16442ef86ec6c1c))

### Bug Fixes

* improve captureStackTrace type safety in http-errors ([15c9465](https://github.com/egose/web-ts-toolkit/commit/15c9465e24562f14aa6d9b9947773b9c1e603af6))

### Docs

* add project readme and release tag dispatch guide ([e5170ea](https://github.com/egose/web-ts-toolkit/commit/e5170ea051ae8dc40ee5b912b2e8e30744bb49ee))
* update README with TypeScript examples and detailed usage ([46ed567](https://github.com/egose/web-ts-toolkit/commit/46ed567970a42823dfdf9241b98af9ee7ed7a406))

### Refactors

* reformat code and documentation ([3fa38dd](https://github.com/egose/web-ts-toolkit/commit/3fa38dd97302bb406266095cd63024bce97184d5))
* reorganize http-errors and express-response-handler ([0d8f66c](https://github.com/egose/web-ts-toolkit/commit/0d8f66c81bb2e11c70840eba7048844876939bad))
