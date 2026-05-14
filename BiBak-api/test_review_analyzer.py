import json
import time
from review_analyzer import analyze_reviews
from review_analyzer.sample_data import (
    get_authentic_reviews,
    get_fake_cluster_1,
    get_mixed_reviews,
)


def run_test(name: str, reviews: list[str]) -> None:
    print(f"\n{'='*70}")
    print(f"  TEST: {name}")
    print(f"  Reviews: {len(reviews)}")
    print(f"{'='*70}")

    start = time.time()
    result = analyze_reviews(reviews)
    elapsed = time.time() - start

    print(f"\n  Fraud Score:              {result['fraud_score']}/100")
    print(f"  Review Authenticity:      {result['review_authenticity_score']}/100")
    print(f"  Suspicious Clusters:      {result['suspicious_clusters']}")
    print(f"  Analysis Time:            {elapsed:.2f}s")

    print(f"\n  REASONS:")
    for reason in result["reasons"]:
        print(f"    • {reason}")

    if result["cluster_data"]:
        print(f"\n  CLUSTER DATA:")
        for c in result["cluster_data"]:
            print(f"    Cluster {c['cluster_id']}: {c['size']} reviews, "
                  f"avg similarity: {c['avg_similarity']:.2%}")
            for sample in c["sample_texts"]:
                print(f"      → \"{sample}...\"")

    print(f"\n  PER-REVIEW SCORES:")
    for r in result["review_scores"]:
        flags_str = ", ".join(r["flags"]) if r["flags"] else "clean"
        print(f"    [{r['index']:2d}] fraud={r['fraud_score']:3d}  "
              f"anomaly={r['anomaly_score']:.3f}  "
              f"cluster={r['cluster_id']:2d}  "
              f"[{flags_str}]  "
              f"\"{r['text_snippet'][:60]}...\"")

    print(f"\n  FULL JSON OUTPUT:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    print("\n" + "="*70)
    print("  BiBak Review Fraud Detection — Test Suite")
    print("="*70)

    run_test("Authentic Reviews Only", get_authentic_reviews())
    run_test("Fake Review Cluster", get_fake_cluster_1())
    run_test("Mixed Reviews (Authentic + Fake)", get_mixed_reviews())

    print(f"\n{'='*70}")
    print("  All tests completed.")
    print(f"{'='*70}\n")
