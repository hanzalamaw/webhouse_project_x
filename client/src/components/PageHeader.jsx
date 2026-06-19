export function PageHeader({ title, description, actions }) {
  return (
    <header className="wh-page-header">
      <div>
        <h1 className="wh-page-header__title">{title}</h1>
        {description && <p className="wh-page-header__desc">{description}</p>}
      </div>
      {actions && <div className="wh-page-header__actions">{actions}</div>}
    </header>
  );
}
