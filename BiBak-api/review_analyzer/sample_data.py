AUTHENTIC_REVIEWS: list[str] = [
    "I've been using this blender for about 3 months now. It handles frozen fruit well and the cleanup is surprisingly easy. The only downside is it's a bit loud on the highest setting.",
    "Decent product for the price. The build quality feels solid but the instruction manual could be better. Took me a while to figure out the pulse feature.",
    "My wife bought this as a gift and I was skeptical at first. After using it daily for smoothies and soups, I'm genuinely impressed. Motor is powerful enough for ice.",
    "Not perfect but gets the job done. I wish the pitcher was glass instead of plastic. The blades are sharp and it blends evenly though.",
    "Replaced my old Vitamix with this budget option. Obviously not the same quality but for the price point it's hard to complain. Works fine for basic blending.",
    "The noise level is definitely higher than advertised. Otherwise it functions as expected. Good suction cups on the base keep it stable.",
    "Bought this for my college dorm. Perfect size, easy to clean, and makes great protein shakes. The travel lid is a nice bonus.",
    "After two weeks of daily use the motor started making a grinding sound. Customer service was responsive and sent a replacement quickly though.",
    "Solid mid-range blender. Crushes ice without issues, blends leafy greens smoothly. The 5-speed settings give decent control over texture.",
    "I compared this with three other blenders in the same price range before buying. This one had the best reviews and I agree with them. Nothing fancy but reliable.",
]

FAKE_REVIEW_CLUSTER_1: list[str] = [
    "Amazing product! Best purchase I've ever made! Absolutely love it! Works perfectly! Highly recommend to everyone!",
    "Absolutely amazing product! This is the best purchase I have ever made! I love it so much! Works perfectly every time! Highly recommend!",
    "This is an amazing product and the best purchase I've made! I absolutely love it! It works perfectly! I highly recommend this to everyone!",
    "Best purchase ever! Amazing product that I absolutely love! Works perfectly and I highly recommend it to everyone!",
    "I love this amazing product! Definitely the best purchase! Works perfectly! Highly recommend to all!",
]

FAKE_REVIEW_CLUSTER_2: list[str] = [
    "Five stars! Great quality and fast shipping. Product exactly as described. Will buy again. Thank you seller!",
    "Five stars for this product! Great quality, fast shipping, exactly as described. I will definitely buy again. Thank you!",
    "Giving five stars! The quality is great, shipping was fast, and the product is exactly as described. Will buy from this seller again!",
    "Product is exactly as described with great quality. Fast shipping too. Five stars and will purchase again. Thanks seller!",
]

MIXED_REVIEWS: list[str] = AUTHENTIC_REVIEWS + FAKE_REVIEW_CLUSTER_1 + FAKE_REVIEW_CLUSTER_2


def get_authentic_reviews() -> list[str]:
    return list(AUTHENTIC_REVIEWS)


def get_fake_cluster_1() -> list[str]:
    return list(FAKE_REVIEW_CLUSTER_1)


def get_fake_cluster_2() -> list[str]:
    return list(FAKE_REVIEW_CLUSTER_2)


def get_mixed_reviews() -> list[str]:
    return list(MIXED_REVIEWS)
