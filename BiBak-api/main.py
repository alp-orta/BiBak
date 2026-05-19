from flask import Flask, request, jsonify
from flask_cors import CORS
from models.api_models import AnalysisResponse
from services import history_store
from services.ml_engine import analyze_product_data

try:
    from uvicorn.middleware.wsgi import WSGIMiddleware
except ImportError:
    WSGIMiddleware = None


flask_app = Flask(__name__)
CORS(flask_app)


@flask_app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200


@flask_app.route('/analyze-product', methods=['POST'])
def analyze_product():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    try:
        result = AnalysisResponse.from_dict(analyze_product_data(data))
    except ValueError as exc:
        return jsonify({"error": "Analysis response validation failed", "details": str(exc)}), 500

    return jsonify(result.to_dict())


@flask_app.route('/history/observe', methods=['POST'])
def observe_history():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    _, errors = history_store.normalize_observation_payload(data)
    if errors:
        return jsonify({"error": "Invalid observation payload", "details": errors}), 400

    try:
        result = history_store.record_observation(data)
    except ValueError as exc:
        return jsonify({"error": "Invalid observation payload", "details": str(exc)}), 400

    return jsonify(result), 201


@flask_app.route('/history/product', methods=['GET'])
def get_product_history():
    platform = request.args.get("platform", "unknown")
    product_id = request.args.get("product_id")
    product_key = request.args.get("product_key")
    listing_id = request.args.get("listing_id")
    seller = request.args.get("seller")
    try:
        limit = int(request.args.get("limit", "40"))
    except ValueError:
        limit = 40

    if not platform or platform == "unknown":
        return jsonify({"error": "platform is required"}), 400
    if not (product_id or product_key or listing_id):
        return jsonify({"error": "product_id, product_key, or listing_id is required"}), 400

    return jsonify(history_store.get_history_response(
        platform=platform,
        product_id=product_id,
        product_key=product_key,
        listing_id=listing_id,
        seller=seller,
        limit=limit,
    ))


app = WSGIMiddleware(flask_app) if WSGIMiddleware is not None else flask_app


if __name__ == '__main__':
    flask_app.run(host='0.0.0.0', port=8000, debug=True)
