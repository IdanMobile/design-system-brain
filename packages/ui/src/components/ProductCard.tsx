import React from "react";

type ProductCardProps = {
  variant?: "default" | "dark" | "compact";
  title?: string;
  status?: string;
  image?: string;
  showBadge?: boolean;
};

export function ProductCard({
  variant = "default",
  title = "Space Helmet\nX24",
  status = "In stock",
  image = "https://picsum.photos/seed/helmet/600/600",
  showBadge = false
}: ProductCardProps) {
  const lines = title.split("\n");

  return (
    <div className={`lab-card ${variant}`} data-figma-component="ProductCard">
      <img alt="helmet" src={image} />
      <div className="lab-card-content">
        {showBadge && <span className="lab-card-badge">Best Seller</span>}
        <h2>{lines.map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{line}</React.Fragment>)}</h2>
        <p>{status}</p>
        <div className="dots">
          <span className="dot big" />
          <span className="dot" style={{ background: "#3f4246" }} />
          <span className="dot" style={{ background: "#ffc43b" }} />
        </div>
      </div>
    </div>
  );
}
