import unittest

from seller_analyzer import analyze_seller


class SellerAnalyzerTest(unittest.TestCase):
    def test_strong_marketplace_seller_scores_high_with_limited_history_warning(self) -> None:
        result = analyze_seller(
            seller_metadata={
                "seller_name": "Kozvit",
                "marketplace_seller_score": 9.6,
                "seller_follower_count": 253_400,
                "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
                "fast_delivery_available": True,
                "free_shipping_available": True,
                "observed_seller_history_count": 1,
                "observed_product_count": 1,
            },
            review_analysis={"fraud_score": 10, "review_authenticity_score": 90},
            pricing_signals=[],
        )

        self.assertGreaterEqual(result["seller_reliability_score"], 75)
        self.assertIn("limited_BiBak_history", result["seller_flags"])
        self.assertTrue(any("marketplace rating" in item for item in result["explanations"]))

    def test_missing_marketplace_identity_scores_lower(self) -> None:
        result = analyze_seller(
            seller_metadata={"seller_name": "Unknown Store"},
            review_analysis={"fraud_score": 10, "review_authenticity_score": 90},
            pricing_signals=[],
        )

        self.assertLess(result["seller_reliability_score"], 75)
        self.assertIn("missing_marketplace_seller_score", result["seller_flags"])
        self.assertIn("weak_seller_identity", result["seller_flags"])

    def test_product_review_risk_is_capped_at_five_points(self) -> None:
        metadata = {
            "seller_name": "Stable Store",
            "marketplace_seller_score": 9.2,
            "seller_follower_count": 50_000,
            "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
            "fast_delivery_available": True,
            "free_shipping_available": True,
            "observed_seller_history_count": 5,
            "observed_product_count": 3,
            "avg_historical_trust_score": 88,
            "avg_historical_fraud_score": 12,
        }
        clean = analyze_seller(
            seller_metadata=metadata,
            review_analysis={"fraud_score": 5, "review_authenticity_score": 95},
            pricing_signals=[],
        )
        risky = analyze_seller(
            seller_metadata=metadata,
            review_analysis={
                "fraud_score": 95,
                "review_authenticity_score": 5,
            },
            pricing_signals=[{"original_price": 1000, "sale_price": 200, "discount_percent": 80}],
        )

        self.assertGreaterEqual(risky["seller_context_adjustment"], -5)
        self.assertLessEqual(clean["seller_reliability_score"] - risky["seller_reliability_score"], 5)

    def test_turkish_explanations_are_localized(self) -> None:
        result = analyze_seller(
            seller_metadata={
                "seller_name": "Kozvit",
                "marketplace_seller_score": 9.6,
                "seller_follower_count": 253_400,
                "seller_badges": ["Hızlı Satıcı", "Kargo Bedava"],
                "fast_delivery_available": True,
                "free_shipping_available": True,
            },
            locale="tr",
        )

        self.assertTrue(any("Satıcının pazar yeri puanı" in item for item in result["explanations"]))
        self.assertFalse(any("Seller has" in item for item in result["explanations"]))

    def test_new_seller_age_reduces_score_and_verified_badge_helps_identity(self) -> None:
        base_metadata = {
            "seller_name": "Verified Store",
            "marketplace_seller_score": 9.4,
            "seller_follower_count": 40_000,
            "seller_badges": ["Doğrulanmış Satıcı", "Kargo Bedava"],
            "verified_badge_available": True,
            "free_shipping_available": True,
            "observed_seller_history_count": 3,
            "observed_product_count": 2,
        }
        established = analyze_seller(
            seller_metadata={**base_metadata, "seller_age_days": 420},
            review_analysis={"fraud_score": 8, "review_authenticity_score": 92},
        )
        new_seller = analyze_seller(
            seller_metadata={**base_metadata, "seller_age_days": 20},
            review_analysis={"fraud_score": 8, "review_authenticity_score": 92},
        )

        self.assertGreater(established["seller_reliability_score"], new_seller["seller_reliability_score"])
        self.assertIn("new_seller", new_seller["seller_flags"])
        self.assertTrue(new_seller["feature_summary"]["verified_badge_available"])


if __name__ == "__main__":
    unittest.main()
