const API_URL = "http://localhost:8000"

export interface ProductData {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
}

export const analyzeProduct = async (data: ProductData) => {
  try {
    const response = await fetch(`${API_URL}/analyze-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to connect to backend", error);
    // Return mock data if backend is down for demo purposes
    return {
      trust_score: 45,
      review_authenticity_score: 30,
      price_integrity_score: 60,
      seller_reliability_score: 50,
      risk_flags: ["High volume of identical reviews", "Recent price spike detected"],
      explanations: ["The reviews show strong clustering indicating possible bot activity."],
      safer_alternatives: []
    }
  }
}
