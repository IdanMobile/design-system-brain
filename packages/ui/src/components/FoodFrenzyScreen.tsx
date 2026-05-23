import React from "react";

const categories = ["🍕 Pizza", "🍔 Burgers", "🍣 Sushi", "🌮 Tacos", "🍩 Sweet"];
const deals = [
  { name: "Triple Stack Inferno", price: "$14.99", tag: "🔥 HOT", rating: "4.9", emoji: "🍔" },
  { name: "Rainbow Roll Tsunami", price: "$22.50", tag: "NEW", rating: "4.8", emoji: "🍣" },
  { name: "Mega Burrito Eclipse", price: "$11.20", tag: "-30%", rating: "4.7", emoji: "🌯" }
];

export function FoodFrenzyScreen() {
  return (
    <div className="lab-food-frenzy" data-figma-component="FoodFrenzyScreen">
      <header className="lab-food-frenzy-header">
        <div>
          <p>Deliver to</p>
          <h1>Neon District 🛵</h1>
        </div>
        <button type="button" className="lab-food-frenzy-cart" aria-label="Cart">
          🛒 <span>3</span>
        </button>
      </header>

      <div className="lab-food-frenzy-promo">
        <div className="lab-food-frenzy-promo-text">
          <span>FLASH DEAL</span>
          <strong>Free fries on orders $25+</strong>
          <em>Ends in 12:04</em>
        </div>
        <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
          <circle cx="45" cy="45" r="40" fill="#FF6B35" />
          <text x="45" y="52" textAnchor="middle" fill="white" fontSize="28">🍟</text>
        </svg>
      </div>

      <div className="lab-food-frenzy-search">
        <span>🔍</span>
        <input type="text" readOnly value="Search crazy combos..." />
      </div>

      <div className="lab-food-frenzy-categories">
        {categories.map((cat) => (
          <button key={cat} type="button" className={cat.includes("Pizza") ? "active" : undefined}>
            {cat}
          </button>
        ))}
      </div>

      <section className="lab-food-frenzy-deals">
        <div className="lab-food-frenzy-deals-head">
          <h2>Trending Chaos</h2>
          <button type="button">See all</button>
        </div>
        {deals.map((deal) => (
          <article key={deal.name} className="lab-food-frenzy-deal-card">
            <div className="lab-food-frenzy-deal-art" aria-hidden="true">
              {deal.emoji}
            </div>
            <div className="lab-food-frenzy-deal-body">
              <span className="tag">{deal.tag}</span>
              <h3>{deal.name}</h3>
              <p>⭐ {deal.rating} • 18 min</p>
              <div className="lab-food-frenzy-deal-foot">
                <strong>{deal.price}</strong>
                <button type="button">Add +</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <button type="button" className="lab-food-frenzy-checkout">
        Checkout • $48.69
      </button>
    </div>
  );
}
