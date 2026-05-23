import React from "react";

const tickers = [
  { sym: "BTC", price: "$98,412", delta: "+4.2%", up: true },
  { sym: "ETH", price: "$3,881", delta: "-1.8%", up: false },
  { sym: "SOL", price: "$214", delta: "+12.1%", up: true },
  { sym: "DOGE", price: "$0.42", delta: "+900%", up: true }
];

const orders = [
  { side: "BUY", pair: "BTC/USDT", amount: "0.842", status: "FILLED" },
  { side: "SELL", pair: "ETH/USDT", amount: "12.0", status: "OPEN" },
  { side: "BUY", pair: "SOL/USDT", amount: "440", status: "PARTIAL" }
];

export function CryptoChaosDashboard() {
  return (
    <div className="lab-crypto-chaos" data-figma-component="CryptoChaosDashboard">
      <header className="lab-crypto-chaos-header">
        <div>
          <span className="lab-crypto-chaos-tag">CHAOS MODE</span>
          <h1>HyperTrade X</h1>
        </div>
        <button type="button" className="lab-crypto-chaos-panic">PANIC SELL</button>
      </header>

      <div className="lab-crypto-chaos-ticker-row">
        {tickers.map((t) => (
          <article key={t.sym} className={`lab-crypto-chaos-ticker${t.up ? " up" : " down"}`}>
            <strong>{t.sym}</strong>
            <span>{t.price}</span>
            <em>{t.delta}</em>
          </article>
        ))}
      </div>

      <section className="lab-crypto-chaos-chart">
        <div className="lab-crypto-chaos-chart-head">
          <h2>BTC / 1H</h2>
          <span>Vol $4.2B</span>
        </div>
        <svg width="358" height="140" viewBox="0 0 358 140" aria-hidden="true">
          <defs>
            <linearGradient id="cryptoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 100 L30 88 L60 95 L90 70 L120 78 L150 45 L180 52 L210 30 L240 38 L270 18 L300 25 L330 10 L358 15 L358 140 L0 140 Z" fill="url(#cryptoFill)" />
          <path d="M0 100 L30 88 L60 95 L90 70 L120 78 L150 45 L180 52 L210 30 L240 38 L270 18 L300 25 L330 10 L358 15" fill="none" stroke="#22c55e" strokeWidth="2.5" />
          {[30, 90, 150, 210, 270, 330].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="140" stroke="rgba(255,255,255,0.06)" />
          ))}
        </svg>
      </section>

      <section className="lab-crypto-chaos-stats">
        <article><span>Portfolio</span><strong>$1.04M</strong></article>
        <article><span>24h PnL</span><strong className="up">+$84,220</strong></article>
        <article><span>Margin</span><strong className="warn">87%</strong></article>
      </section>

      <section className="lab-crypto-chaos-orders">
        <h3>Open Orders</h3>
        {orders.map((o) => (
          <div key={`${o.side}-${o.pair}`} className={`lab-crypto-chaos-order ${o.side.toLowerCase()}`}>
            <span className="side">{o.side}</span>
            <span className="pair">{o.pair}</span>
            <span className="amt">{o.amount}</span>
            <span className="status">{o.status}</span>
          </div>
        ))}
      </section>

      <footer className="lab-crypto-chaos-footer">
        <button type="button">Limit Buy</button>
        <button type="button" className="primary">Market Buy</button>
        <button type="button" className="danger">Liquidate All</button>
      </footer>
    </div>
  );
}
