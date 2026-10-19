/**
 * adhx.com, the product site: a static export published to GitHub Pages
 * (.github/workflows/site.yml). It uses the repo's installed packages but
 * nothing from the app itself.
 */
export default {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}
