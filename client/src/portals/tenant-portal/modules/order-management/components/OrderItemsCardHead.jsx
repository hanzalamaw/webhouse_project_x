export function OrderItemsCardHead({ itemCount, unitCount, actions = null }) {
  return (
    <div className="wh-order-items-card__head">
      <div className="wh-order-items-card__head-main">
        <h3 className="wh-card__title">Line items</h3>
        <span className="wh-order-items-card__count">
          {itemCount} product{itemCount === 1 ? "" : "s"} · {unitCount} unit{unitCount === 1 ? "" : "s"}
        </span>
      </div>
      {actions ? <div className="wh-order-items-card__actions">{actions}</div> : null}
    </div>
  );
}
