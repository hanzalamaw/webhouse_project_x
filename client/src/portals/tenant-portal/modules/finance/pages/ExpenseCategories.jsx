import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { Modal } from "../../../../../components/Modal";
import { FormPageLayout, FormPageAlerts } from "../../../../../components/FormPageLayout";

export default function ExpenseCategories() {
  const { authFetch } = useAuth();
  const { canCreate } = useModulePermission("finance");
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [newSubCategory, setNewSubCategory] = useState("");
  const [savingSubCategory, setSavingSubCategory] = useState(false);
  const [modalError, setModalError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ref = await apiFetch("/finance/expenses/reference", {}, authFetch);
      setCategories(ref.categories || []);
      setSubCategories(ref.sub_categories || []);
    } catch (e) {
      setError(e.message);
      setCategories([]);
      setSubCategories([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const subsFor = (categoryId) =>
    subCategories.filter((s) => String(s.category_id) === String(categoryId));

  const addCategory = async (e) => {
    e.preventDefault();
    if (!canCreate || !newCategory.trim()) return;
    setSavingCategory(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/finance/expense-categories", {
        method: "POST",
        body: JSON.stringify({ category_name: newCategory.trim() }),
      }, authFetch);
      setNewCategory("");
      setMessage("Category added.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingCategory(false);
    }
  };

  const openCategory = (category) => {
    setSelectedCategory(category);
    setNewSubCategory("");
    setModalError("");
  };

  const closeCategoryModal = () => {
    setSelectedCategory(null);
    setNewSubCategory("");
    setModalError("");
  };

  const addSubCategory = async (e) => {
    e.preventDefault();
    if (!selectedCategory || !canCreate || !newSubCategory.trim()) return;
    setSavingSubCategory(true);
    setModalError("");
    setMessage("");
    try {
      await apiFetch(`/finance/expense-categories/${selectedCategory.id}/sub-categories`, {
        method: "POST",
        body: JSON.stringify({ sub_category_name: newSubCategory.trim() }),
      }, authFetch);
      setNewSubCategory("");
      setMessage(`Sub-category added to ${selectedCategory.category_name}.`);
      await load();
    } catch (e) {
      setModalError(e.message);
    } finally {
      setSavingSubCategory(false);
    }
  };

  const selectedSubs = selectedCategory ? subsFor(selectedCategory.id) : [];

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Expense categories"
          description="Organize expenses with categories and sub-categories. Pick them when recording expenses or recurring schedules."
        />
        <FormPageAlerts error={error} message={message} />

        <div className="wh-form-stack">
          <Card className="wh-finance-category-add-card">
            <h3 className="wh-card__title">New category</h3>
            <form className="wh-finance-category-add-form" onSubmit={addCategory}>
              <FormField
                id="new-expense-category"
                label="Category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                disabled={!canCreate || savingCategory}
                placeholder="e.g. Office supplies"
              />
              <Button type="submit" disabled={!canCreate || savingCategory || !newCategory.trim()}>
                {savingCategory ? "Adding…" : "Add category"}
              </Button>
            </form>
          </Card>

          {loading ? (
            <p className="wh-muted">Loading categories…</p>
          ) : categories.length === 0 ? (
            <Card><p className="wh-muted" style={{ margin: 0 }}>No categories yet. Add your first category above.</p></Card>
          ) : (
            <Card>
              <div className="wh-finance-category-list">
                {categories.map((cat) => {
                  const count = subsFor(cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="wh-finance-category-row"
                      onClick={() => openCategory(cat)}
                    >
                      <span className="wh-finance-category-row__name">{cat.category_name}</span>
                      <span className="wh-finance-category-row__meta">
                        {count} sub-categor{count === 1 ? "y" : "ies"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <Modal
          open={!!selectedCategory}
          onClose={closeCategoryModal}
          title={selectedCategory ? `${selectedCategory.category_name} — sub-categories` : "Sub-categories"}
          footer={
            <>
              {modalError && <p className="wh-field__error">{modalError}</p>}
              <Button variant="secondary" onClick={closeCategoryModal}>Close</Button>
            </>
          }
        >
          {selectedCategory && (
            <>
              {selectedSubs.length === 0 ? (
                <p className="wh-muted" style={{ marginTop: 0 }}>No sub-categories yet. Add one below.</p>
              ) : (
                <ul className="wh-finance-subcategory-list">
                  {selectedSubs.map((sub) => (
                    <li key={sub.id} className="wh-finance-subcategory-list__item">
                      {sub.sub_category_name}
                    </li>
                  ))}
                </ul>
              )}

              <form className="wh-finance-subcategory-add-form" onSubmit={addSubCategory}>
                <FormField
                  id="new-expense-subcategory"
                  label="Add sub-category"
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  disabled={!canCreate || savingSubCategory}
                  placeholder="e.g. Stationery"
                />
                <Button
                  type="submit"
                  disabled={!canCreate || savingSubCategory || !newSubCategory.trim()}
                >
                  {savingSubCategory ? "Adding…" : "Add sub-category"}
                </Button>
              </form>
            </>
          )}
        </Modal>
      </FormPageLayout>
    </div>
  );
}
