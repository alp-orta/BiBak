from pydantic import BaseModel
from typing import List

class ProductRequest(BaseModel):
    title: str
    price: str
    seller: str
    reviews: List[str]
    rating: float

class AnalysisResponse(BaseModel):
    trust_score: int
    review_authenticity_score: int
    price_integrity_score: int
    seller_reliability_score: int
    risk_flags: List[str]
    explanations: List[str]
    safer_alternatives: List[str]
