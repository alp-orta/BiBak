from models.api_models import ProductRequest, AnalysisResponse
import random

def analyze_product_data(product: ProductRequest) -> AnalysisResponse:
    # MVP Phase 1: Mocked realistic responses
    # In Phase 2, this will be replaced with real sentence-transformers and xgboost logic
    
    # Simple deterministic mock based on the length of the title
    is_suspicious = len(product.title) > 50 or "fake" in product.title.lower() or product.rating > 4.8
    
    if is_suspicious:
        return AnalysisResponse(
            trust_score=random.randint(20, 50),
            review_authenticity_score=random.randint(10, 40),
            price_integrity_score=random.randint(50, 70),
            seller_reliability_score=random.randint(20, 40),
            risk_flags=[
                "Abnormal review sentiment clustering",
                "Seller rating does not match review volume",
                "Potential keyword stuffing in title"
            ],
            explanations=[
                "We detected high similarity among 45% of the 5-star reviews, indicating possible bot activity."
            ],
            safer_alternatives=[
                "https://amazon.com/dp/safer-alternative-mock"
            ]
        )
    else:
        return AnalysisResponse(
            trust_score=random.randint(85, 98),
            review_authenticity_score=random.randint(80, 95),
            price_integrity_score=random.randint(90, 100),
            seller_reliability_score=random.randint(85, 100),
            risk_flags=[],
            explanations=[
                "Reviews appear authentic with natural sentiment distribution.",
                "Price is consistent with historical trends."
            ],
            safer_alternatives=[]
        )
