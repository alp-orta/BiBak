from flask import Flask, request, jsonify
from flask_cors import CORS
from services.ml_engine import analyze_product_data
import logging

app = Flask(__name__)
CORS(app)

@app.route('/analyze-product', methods=['POST'])
def analyze_product():
    data = request.json
    result = analyze_product_data(data)
    return jsonify(result)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
