from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.api_models import ProductRequest, AnalysisResponse
from services.ml_engine import analyze_product_data

app = FastAPI(title="BiBak API", description="AI-powered product analysis", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for the hackathon MVP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze-product", response_model=AnalysisResponse)
async def analyze_product(request: ProductRequest):
    # Delegate to the ML engine to calculate the trust score
    result = analyze_product_data(request)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
