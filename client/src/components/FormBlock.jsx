export function FormBlock({ title, description, children }) {
  return (
    <div className="wh-form-block">
      <div className="wh-form-block__header">
        <div>
          <h3 className="wh-form-block__title">{title}</h3>
          {description && <p className="wh-form-block__desc">{description}</p>}
        </div>
      </div>
      <div className="wh-form-block__body">{children}</div>
    </div>
  );
}
