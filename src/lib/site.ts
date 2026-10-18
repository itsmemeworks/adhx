/**
 * adhx.com shows the product site at "/" to signed-out visitors
 * (`ADHX_PRODUCT_SITE=1`). A self-hosted ADHX leaves it unset and keeps its
 * own home page.
 */
export function productSiteEnabled(): boolean {
  const v = process.env['ADHX_PRODUCT_SITE']
  return v === '1' || v === 'true' || v === 'on'
}
