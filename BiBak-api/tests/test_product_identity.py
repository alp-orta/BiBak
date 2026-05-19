import unittest

from services.product_identity import resolve_product_identity


class ProductIdentityTest(unittest.TestCase):
    def test_trendyol_identity_uses_content_listing_seller_and_canonical_url(self) -> None:
        identity = resolve_product_identity({
            "platform": "trendyol",
            "url": "https://www.trendyol.com/icollagen/kolajen-tablet-p-752356123?boutiqueId=1&merchantId=777",
            "scrape_metadata": {
                "listingId": "listing-123",
                "diagnostics": {"selectedListingId": "listing-fallback"},
            },
            "seller_metadata": {
                "store_url": "https://www.trendyol.com/magaza/kozvit-m-204",
            },
            "category": "vitamin",
        })

        self.assertEqual(identity.platform, "trendyol")
        self.assertEqual(identity.product_id, "752356123")
        self.assertEqual(identity.product_key, "trendyol:product:752356123")
        self.assertEqual(identity.listing_id, "listing-123")
        self.assertEqual(identity.variant_id, "listing-123")
        self.assertEqual(identity.seller_id, "204")
        self.assertEqual(identity.category, "vitamin")
        self.assertEqual(
            identity.canonical_url,
            "https://www.trendyol.com/icollagen/kolajen-tablet-p-752356123",
        )

    def test_amazon_identity_normalizes_asin_and_canonical_url(self) -> None:
        identity = resolve_product_identity({
            "platform": "amazon",
            "url": "https://www.amazon.com.tr/gp/product/b0c123abcd/ref=sxin?th=1&psc=1",
            "scrape_metadata": {
                "diagnostics": {"selectedListingId": "B0C123ABCD:offer-1"},
            },
            "seller_metadata": {
                "seller_id": "A1SELLER42",
            },
        })

        self.assertEqual(identity.product_id, "B0C123ABCD")
        self.assertEqual(identity.product_key, "amazon:product:B0C123ABCD")
        self.assertEqual(identity.listing_id, "B0C123ABCD:offer-1")
        self.assertEqual(identity.variant_id, "B0C123ABCD:offer-1")
        self.assertEqual(identity.seller_id, "A1SELLER42")
        self.assertEqual(identity.canonical_url, "https://www.amazon.com.tr/dp/B0C123ABCD")

    def test_hepsiburada_identity_extracts_product_id_from_url(self) -> None:
        identity = resolve_product_identity({
            "platform": "hepsiburada",
            "url": "https://www.hepsiburada.com/example-product-p-HBCV000123ABC?magaza=Test",
            "seller_id": "merchant-77",
        })

        self.assertEqual(identity.product_id, "HBCV000123ABC")
        self.assertEqual(identity.product_key, "hepsiburada:product:HBCV000123ABC")
        self.assertEqual(
            identity.canonical_url,
            "https://www.hepsiburada.com/example-product-p-HBCV000123ABC",
        )
        self.assertEqual(identity.seller_id, "merchant-77")

    def test_fallback_identity_keeps_title_and_seller_boundary(self) -> None:
        identity = resolve_product_identity({
            "platform": "unknown",
            "title": "  Test Product  ",
            "seller": " Demo Store ",
        })

        self.assertEqual(identity.product_id, None)
        self.assertEqual(identity.product_key, "unknown:fallback:test product:demo store")


if __name__ == "__main__":
    unittest.main()
