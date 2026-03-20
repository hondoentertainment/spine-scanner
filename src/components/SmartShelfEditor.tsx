import React, { useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useBookStore } from '../store/useBookStore.ts';
import { SMART_SHELF_TEMPLATES, getBooksForSmartShelf } from '../utils/smartShelfEngine.ts';
import type { SmartShelf, SmartShelfRule } from '../types.ts';
import s from './SmartShelfEditor.module.css';

const FIELD_OPTIONS: { value: SmartShelfRule['field']; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
  { value: 'pageCount', label: 'Page Count' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'rating', label: 'Rating' },
  { value: 'metadataSource', label: 'Metadata Source' },
];

const OPERATOR_OPTIONS: { value: SmartShelfRule['operator']; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
];

interface SmartShelfEditorProps {
  /** Existing smart shelf to edit, or undefined for new */
  shelf?: SmartShelf;
  onClose: () => void;
}

const SmartShelfEditor: React.FC<SmartShelfEditorProps> = ({ shelf, onClose }) => {
  const { books, addSmartShelf, updateSmartShelf } = useBookStore();

  const [name, setName] = useState(shelf?.name ?? '');
  const [color, setColor] = useState(shelf?.color ?? '#6366f1');
  const [rules, setRules] = useState<SmartShelfRule[]>(shelf?.rules ?? []);

  const matchingCount = useMemo(() => {
    const preview: SmartShelf = { id: 'preview', name, color, rules };
    return getBooksForSmartShelf(books, preview).length;
  }, [books, name, color, rules]);

  const handleAddRule = () => {
    setRules([...rules, { field: 'status', operator: 'equals', value: '' }]);
  };

  const handleRemoveRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleRuleChange = (index: number, updates: Partial<SmartShelfRule>) => {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const handleApplyTemplate = (template: Omit<SmartShelf, 'id'>) => {
    setName(template.name);
    setColor(template.color);
    setRules([...template.rules]);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (shelf) {
      updateSmartShelf(shelf.id, { name: trimmedName, color, rules });
    } else {
      const id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);
      addSmartShelf({ id, name: trimmedName, color, rules });
    }
    onClose();
  };

  return (
    <div className={s.overlay} onClick={onClose} data-testid="smart-shelf-editor-overlay">
      <div className={s.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Smart shelf editor">
        <div className={s.title}>{shelf ? 'Edit Smart Shelf' : 'New Smart Shelf'}</div>

        {/* Name & Color */}
        <div className={s.nameRow}>
          <input
            type="text"
            className={s.nameInput}
            placeholder="Shelf name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="smart-shelf-name"
          />
          <input
            type="color"
            className={s.colorInput}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Shelf color"
          />
        </div>

        {/* Rules */}
        <div className={s.rulesHeader}>
          <span className={s.rulesLabel}>Rules (all must match)</span>
          <button className={s.addRuleBtn} onClick={handleAddRule} data-testid="add-rule-btn">
            <Plus size={12} /> Add Rule
          </button>
        </div>

        {rules.length === 0 && (
          <div className={s.noRules}>No rules yet. Add rules to auto-match books.</div>
        )}

        {rules.map((rule, index) => (
          <div key={index} className={s.ruleRow} data-testid={`rule-row-${index}`}>
            <select
              className={s.ruleSelect}
              value={rule.field}
              onChange={(e) => handleRuleChange(index, { field: e.target.value as SmartShelfRule['field'] })}
              aria-label="Rule field"
            >
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              className={s.ruleSelect}
              value={rule.operator}
              onChange={(e) => handleRuleChange(index, { operator: e.target.value as SmartShelfRule['operator'] })}
              aria-label="Rule operator"
            >
              {OPERATOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <input
              type="text"
              className={s.ruleValue}
              placeholder="Value..."
              value={rule.value}
              onChange={(e) => handleRuleChange(index, { value: e.target.value })}
              aria-label="Rule value"
            />

            <button
              className={s.removeRuleBtn}
              onClick={() => handleRemoveRule(index)}
              aria-label={`Remove rule ${index + 1}`}
              data-testid={`remove-rule-${index}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Templates */}
        <div className={s.templatesSection}>
          <div className={s.templatesLabel}>Templates</div>
          <div className={s.templates}>
            {SMART_SHELF_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                className={s.templateBtn}
                style={{ borderColor: tmpl.color }}
                onClick={() => handleApplyTemplate(tmpl)}
                data-testid={`template-${tmpl.name}`}
              >
                {tmpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className={s.preview}>
          Matching books: <span className={s.previewCount}>{matchingCount}</span>
        </div>

        {/* Footer */}
        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={s.saveBtn}
            onClick={handleSave}
            disabled={!name.trim()}
            data-testid="save-smart-shelf"
          >
            {shelf ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartShelfEditor;
