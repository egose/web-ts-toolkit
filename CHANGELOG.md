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
