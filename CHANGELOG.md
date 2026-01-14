# Changelog

## [1.6.4](https://github.com/itsmemeworks/adhx/compare/v1.6.3...v1.6.4) (2026-01-14)


### Bug Fixes

* trigger deploy via workflow_dispatch after release creation ([#37](https://github.com/itsmemeworks/adhx/issues/37)) ([f08b21f](https://github.com/itsmemeworks/adhx/commit/f08b21f6bfe39e4ab1cca9601a86e0cd6076c026))

## [1.6.3](https://github.com/itsmemeworks/adhx/compare/v1.6.2...v1.6.3) (2026-01-14)


### Bug Fixes

* trigger deploy on release published event ([#34](https://github.com/itsmemeworks/adhx/issues/34)) ([d85efaa](https://github.com/itsmemeworks/adhx/commit/d85efaa3e25be24f1ddfca7977b33d673c07e9ab))

## [1.6.2](https://github.com/itsmemeworks/adhx/compare/v1.6.1...v1.6.2) (2026-01-14)


### Bug Fixes

* deploy only on release pr merges ([#31](https://github.com/itsmemeworks/adhx/issues/31)) ([e95c1cd](https://github.com/itsmemeworks/adhx/commit/e95c1cd20d038b5693427b5a0c669cb286ee3714))
* use workflow_call to trigger deploys only on release ([#33](https://github.com/itsmemeworks/adhx/issues/33)) ([0813dfd](https://github.com/itsmemeworks/adhx/commit/0813dfd7286d1c915d370f26988a01c9cb6d9456))

## [1.6.1](https://github.com/itsmemeworks/adhx/compare/v1.6.0...v1.6.1) (2026-01-14)


### Bug Fixes

* auto-update release pr branch to stay current with main ([#30](https://github.com/itsmemeworks/adhx/issues/30)) ([9c8c97e](https://github.com/itsmemeworks/adhx/commit/9c8c97eac805a06f59bfb8620222fde660018c74))
* quote yaml if condition to prevent syntax error ([#27](https://github.com/itsmemeworks/adhx/issues/27)) ([1e6d4de](https://github.com/itsmemeworks/adhx/commit/1e6d4de7bab0537260c6aa7234f62ca6d96e452c))

## [1.6.0](https://github.com/itsmemeworks/adhx/compare/v1.5.1...v1.6.0) (2026-01-14)


### Features

* add sentry metrics for user behavior tracking ([#26](https://github.com/itsmemeworks/adhx/issues/26)) ([631e9ee](https://github.com/itsmemeworks/adhx/commit/631e9eeef6616c66306a2aa3a081d527ff71663b))
* add sentry release tracking and deploy workflow ([#25](https://github.com/itsmemeworks/adhx/issues/25)) ([00e7c0a](https://github.com/itsmemeworks/adhx/commit/00e7c0a28ba455433a3fc32fb052d82d56d27483))
* add sentry test endpoint for verification ([#23](https://github.com/itsmemeworks/adhx/issues/23)) ([914a3df](https://github.com/itsmemeworks/adhx/commit/914a3df39435e0c2c4b9a6e4e1de624694f1249f))

## [1.5.1](https://github.com/itsmemeworks/adhx/compare/v1.5.0...v1.5.1) (2026-01-14)


### Bug Fixes

* add checks write permission to ci workflow ([#22](https://github.com/itsmemeworks/adhx/issues/22)) ([a418624](https://github.com/itsmemeworks/adhx/commit/a4186249def75b91be43acd0bb12d36bb9897a08))
* add workaround to auto-fix stuck release prs ([#18](https://github.com/itsmemeworks/adhx/issues/18)) ([5b2721c](https://github.com/itsmemeworks/adhx/commit/5b2721c1c478a61cefae5399f11fee60dc9ed7b5))
* remove duplicate build job and fix event conditions ([#21](https://github.com/itsmemeworks/adhx/issues/21)) ([9d8cfec](https://github.com/itsmemeworks/adhx/commit/9d8cfec328e614749c8f32454d3ed53b0d106376))
* use github checks api to report ci status for release prs ([#20](https://github.com/itsmemeworks/adhx/issues/20)) ([2f458d6](https://github.com/itsmemeworks/adhx/commit/2f458d69d9f9ffc1c125604fe88b9d3bd2ff0251))

## [1.5.0](https://github.com/itsmemeworks/adhx/compare/v1.4.3...v1.5.0) (2026-01-14)


### Features

* add sentry error tracking and fix release-please ci trigger ([#17](https://github.com/itsmemeworks/adhx/issues/17)) ([9f79990](https://github.com/itsmemeworks/adhx/commit/9f799900466f2562ce30a42ee631a569371b18b1))


### Bug Fixes

* add explicit pull-request-title-pattern for release-please ([#15](https://github.com/itsmemeworks/adhx/issues/15)) ([e2c9702](https://github.com/itsmemeworks/adhx/commit/e2c9702cec64983161f8b1ee3edce8992d43fe71))

## [1.4.3](https://github.com/itsmemeworks/adhx/compare/v1.4.2...v1.4.3) (2026-01-14)


### Bug Fixes

* explicitly set empty component to override package.json name ([#13](https://github.com/itsmemeworks/adhx/issues/13)) ([4a45489](https://github.com/itsmemeworks/adhx/commit/4a454891c1cf6fc5ae233c6b17af6315a5ca47db))

## [1.4.2](https://github.com/itsmemeworks/adhx/compare/v1.4.1...v1.4.2) (2026-01-14)


### Bug Fixes

* remove package-name to fix release-please component mismatch ([#11](https://github.com/itsmemeworks/adhx/issues/11)) ([75295ab](https://github.com/itsmemeworks/adhx/commit/75295ab8b5a7f9ba2e49d3ffa9912e11045f2f25))

## [1.4.1](https://github.com/itsmemeworks/adhx/compare/v1.4.0...v1.4.1) (2026-01-14)


### Bug Fixes

* run build job but skip steps for release-please prs ([#10](https://github.com/itsmemeworks/adhx/issues/10)) ([c79cf9c](https://github.com/itsmemeworks/adhx/commit/c79cf9c547b08f819cef0d67310acbc00ef11c1b))
* skip filter fetches during active sync ([#7](https://github.com/itsmemeworks/adhx/issues/7)) ([cc08a9d](https://github.com/itsmemeworks/adhx/commit/cc08a9dff24a30e8fe1c1d119dee50f766dff1d8))

## [1.4.0](https://github.com/itsmemeworks/adhx/compare/v1.3.0...v1.4.0) (2026-01-14)


### Features

* add fly.io deployment configuration ([#3](https://github.com/itsmemeworks/adhx/issues/3)) ([482bfbf](https://github.com/itsmemeworks/adhx/commit/482bfbfa2f243fb11b9785f289ee939b8dfeaa96))


### Bug Fixes

* prevent duplicate bookmark errors and connection timeouts during sync ([#5](https://github.com/itsmemeworks/adhx/issues/5)) ([24a6441](https://github.com/itsmemeworks/adhx/commit/24a6441b66d9a490d3542fe8f166ef019818dc99))


### Documentation

* clean up changelog for open source release ([#2](https://github.com/itsmemeworks/adhx/issues/2)) ([7671831](https://github.com/itsmemeworks/adhx/commit/7671831e5d7aac85d1b2706a46df7b40df67472c))

## [1.3.0](https://github.com/itsmemeworks/adhx/releases/tag/v1.3.0) (2026-01-14)

Initial open source release of ADHX - a Twitter/X bookmark manager for people who bookmark everything and read nothing.

### Features

* Full-text search across all bookmarks
* Masonry gallery view with hover previews
* Custom tags for organization
* Read/unread tracking
* ADHD-friendly fonts (Lexend, Atkinson Hyperlegible, etc.)
* Bionic reading mode
* Keyboard shortcuts for efficient navigation
* URL prefix feature (`adhx.com/user/status/123`)
* Media support for images and videos
* Article rendering with rich text
