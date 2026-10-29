import { ProductSite } from '../components/ProductSite'
import { homeJsonLd, jsonLd } from '../components/seo'

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(homeJsonLd()) }}
      />
      <ProductSite />
    </>
  )
}
