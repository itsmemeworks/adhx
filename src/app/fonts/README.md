# Bundled fonts

The application and product website use local font files. Builds do not fetch fonts from Google.

The eight families added on 19 October 2026 come from the official [Google Fonts repository](https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33), pinned at `47d54ca1ebb14fd864695f1d39dc734f39017c33`. Their TTF contents are unchanged; filenames omit axis brackets for convenient local imports. Each family’s unchanged SIL Open Font License is stored alongside its files.

To update, download the source files from an explicitly selected upstream revision, retain the adjacent OFL license files, update the provenance and hashes below, and build both the application and product website. No font conversion or subsetting tool is required.

| Bundled file                       | Upstream file at the pinned revision                        | SHA-256                                                            |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `IBMPlexSans-variable.ttf`         | `ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf`                | `3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3` |
| `Inter-variable.ttf`               | `ofl/inter/Inter[opsz,wght].ttf`                            | `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |
| `Lexend-variable.ttf`              | `ofl/lexend/Lexend[wght].ttf`                               | `3add53e641fbc81da64da4bb254285e2831b52b029527bc0714e2b9610832ee6` |
| `AtkinsonHyperlegible-Regular.ttf` | `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf` | `7fb917c89019896d0b52ee84b7cbb3304c18cb90b19a62f5e32712bd23e97669` |
| `AtkinsonHyperlegible-Bold.ttf`    | `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Bold.ttf`    | `5a3b0c8cc8ca545155150b4512a1fa248298df121c50d6557e651e61fbdab92f` |
| `IndieFlower-Regular.ttf`          | `ofl/indieflower/IndieFlower-Regular.ttf`                   | `ccc94b22b156e9c5dfe50fd051f01b097600b252c24473e624bb43a143140a94` |
| `Newsreader-variable.ttf`          | `ofl/newsreader/Newsreader[opsz,wght].ttf`                  | `8a08d13f8a6c0d51be379a60af84f945f65369a67e509ee3c3bdcc421254d7c1` |
| `Newsreader-Italic-variable.ttf`   | `ofl/newsreader/Newsreader-Italic[opsz,wght].ttf`           | `796668611f80b64d5adf182fde3b6f29ed83b4e7cbec7b96937e84ac01364792` |
| `RobotoMono-variable.ttf`          | `ofl/robotomono/RobotoMono[wght].ttf`                       | `66a80e79d17e4c7cabd162e2916578a4cc08fd19eef6e2a643305eae9c567b2b` |
| `InstrumentSerif-Regular.ttf`      | `ofl/instrumentserif/InstrumentSerif-Regular.ttf`           | `498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88` |
| `InstrumentSerif-Italic.ttf`       | `ofl/instrumentserif/InstrumentSerif-Italic.ttf`            | `08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385` |

`HankenGrotesk-latin-variable.woff2` and its adjacent license predate this vendoring change. Its original source is the [Hanken Grotesk project](https://github.com/marcologous/hanken-grotesk), named in the license. Both applications reuse this existing file.
