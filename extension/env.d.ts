/// <reference types="extension/types" />
/// <reference types="extension/types/polyfill" />

interface ImportMetaEnv {
  readonly EXTENSION_PUBLIC_APP_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
