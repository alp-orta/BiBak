from flask import Flask, request, jsonify
from flask_cors import CORS
from services.ml_engine import analyze_product_data

try:
    from uvicorn.middleware.wsgi import WSGIMiddleware
except ImportError:
    WSGIMiddleware = None


flask_app = Flask(__name__)
CORS(flask_app)


@flask_app.route('/analyze-product', methods=['POST'])
def analyze_product():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    result = analyze_product_data(data)
    return jsonify(result)


app = WSGIMiddleware(flask_app) if WSGIMiddleware is not None else flask_app


if __name__ == '__main__':
    flask_app.run(host='0.0.0.0', port=8000, debug=True)
