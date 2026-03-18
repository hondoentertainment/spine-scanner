import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import { SHELF_COLORS } from '../types.ts';
import type { Shelf, SmartShelf, SmartShelfRule, SmartShelfField, SmartShelfOp } from '../types.ts';
import { countSmartShelfMatches } from '../utils/smartShelf.ts';
import { Plus, X, Pencil, Check, Tag, Zap, Trash2 } from 'lucide-react';
import s from './ShelfManager.module.css';

const FIELD_LABELS: Record<SmartShelfField, string> = {
    status: 'Status',
    title: 'Title',
    author: 'Author',
    pageCount: 'Page count',
    dateAdded: 'Date added',
    hasProgress: 'Has progress',
};

const OP_OPTIONS: Record<SmartShelfField, { op: SmartShelfOp; label: string }[]> = {
    status: [
        { op: 'eq', label: 'is' },
        { op: 'neq', label: 'is not' },
    ],
    title: [
        { op: 'contains', label: 'contains' },
        { op: 'neq', label: 'does not contain' },
    ],
    author: [
        { op: 'contains', label: 'contains' },
        { op: 'neq', label: 'does not contain' },
    ],
    pageCount: [
        { op: 'gt', label: 'more than' },
        { op: 'lt', label: 'less than' },
    ],
    dateAdded: [
        { op: 'within_days', label: 'within last (days)' },
    ],
    hasProgress: [
        { op: 'eq', label: 'is' },
    ],
};

const VALUE_HINTS: Partial<Record<SmartShelfField, string>> = {
    pageCount: 'number of pages',
    dateAdded: 'e.g. 30',
};

function defaultValue(field: SmartShelfField): string {
    if (field === 'status') return 'reading';
    if (field === 'hasProgress') return 'true';
    if (field === 'dateAdded') return '30';
    if (field === 'pageCount') return '300';
    return '';
}

function RuleRow({
    rule,
    onChange,
    onRemove,
}: {
    rule: SmartShelfRule;
    onChange: (r: SmartShelfRule) => void;
    onRemove: () => void;
}) {
    const opOptions = OP_OPTIONS[rule.field];
    return (
        <div className={s.ruleRow}>
            <select className={s.ruleSelect}
                value={rule.field}
                onChange={(e) => {
                    const field = e.target.value as SmartShelfField;
                    const op = OP_OPTIONS[field][0].op;
                    onChange({ field, op, value: defaultValue(field) });
                }}>
                {(Object.keys(FIELD_LABELS) as SmartShelfField[]).map((f) => (
                    <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                ))}
            </select>
            <select className={s.ruleSelect}
                value={rule.op}
                onChange={(e) => onChange({ ...rule, op: e.target.value as SmartShelfOp })}>
                {opOptions.map(({ op, label }) => (
                    <option key={op} value={op}>{label}</option>
                ))}
            </select>
            {rule.field === 'status' ? (
                <select className={s.ruleSelect} value={rule.value}
                    onChange={(e) => onChange({ ...rule, value: e.target.value })}>
                    <option value="to-read">To Read</option>
                    <option value="reading">Reading</option>
                    <option value="read">Read</option>
                    <option value="dnf">DNF</option>
                </select>
            ) : rule.field === 'hasProgress' ? (
                <select className={s.ruleSelect} value={rule.value}
                    onChange={(e) => onChange({ ...rule, value: e.target.value })}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            ) : (
                <input className={s.ruleInput} type={rule.field === 'pageCount' || rule.field === 'dateAdded' ? 'number' : 'text'}
                    value={rule.value}
                    placeholder={VALUE_HINTS[rule.field] ?? 'value'}
                    onChange={(e) => onChange({ ...rule, value: e.target.value })}
                    min={0} />
            )}
            <button onClick={onRemove} className={s.ruleRemoveBtn} aria-label="Remove rule">
                <X size={12} />
            </button>
        </div>
    );
}

const newRuleDefault = (): SmartShelfRule => ({ field: 'status', op: 'eq', value: 'reading' });

const ShelfManager: React.FC = () => {
    const { shelves, smartShelves, books, addShelf, updateShelf, removeShelf,
        addSmartShelf, updateSmartShelf, removeSmartShelf } = useBookStore();
    const { toast, confirm } = useToast();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    // Smart shelf draft state
    const [showSmartCreate, setShowSmartCreate] = useState(false);
    const [editingSmartId, setEditingSmartId] = useState<string | null>(null);
    const [smartDraft, setSmartDraft] = useState<{ name: string; match: 'all' | 'any'; rules: SmartShelfRule[] }>({
        name: '',
        match: 'all',
        rules: [newRuleDefault()],
    });

    const nextColor = SHELF_COLORS[shelves.length % SHELF_COLORS.length];
    const nextSmartColor = SHELF_COLORS[(shelves.length + smartShelves.length) % SHELF_COLORS.length];

    const handleCreate = () => {
        const name = newName.trim();
        if (!name) return;
        if (shelves.some((sh) => sh.name.toLowerCase() === name.toLowerCase())) {
            toast('A shelf with this name already exists', 'warning');
            return;
        }

        const shelf: Shelf = {
            id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            name,
            color: nextColor,
        };
        addShelf(shelf);
        setNewName('');
        setShowCreate(false);
        toast(`Shelf "${name}" created`, 'success');
    };

    const handleRename = (id: string) => {
        const name = editName.trim();
        if (!name) return;
        updateShelf(id, { name });
        setEditingId(null);
    };

    const handleDelete = async (shelf: Shelf) => {
        const count = books.filter((b) => (b.shelfIds || []).includes(shelf.id)).length;
        const msg = count > 0
            ? `Delete "${shelf.name}"? It will be removed from ${count} book${count > 1 ? 's' : ''}.`
            : `Delete "${shelf.name}"?`;
        const yes = await confirm({ title: 'Delete Shelf', message: msg, confirmLabel: 'Delete', danger: true });
        if (yes) {
            removeShelf(shelf.id);
            toast(`Shelf "${shelf.name}" deleted`, 'info');
        }
    };

    const countBooks = (shelfId: string) =>
        books.filter((b) => (b.shelfIds || []).includes(shelfId)).length;

    // Smart shelf handlers
    const openSmartCreate = () => {
        setEditingSmartId(null);
        setSmartDraft({ name: '', match: 'all', rules: [newRuleDefault()] });
        setShowSmartCreate(true);
    };

    const openSmartEdit = (ss: SmartShelf) => {
        setEditingSmartId(ss.id);
        setSmartDraft({ name: ss.name, match: ss.match, rules: ss.rules.map((r) => ({ ...r })) });
        setShowSmartCreate(true);
    };

    const handleSmartSave = () => {
        const name = smartDraft.name.trim();
        if (!name || smartDraft.rules.length === 0) return;

        if (editingSmartId) {
            updateSmartShelf(editingSmartId, { name, match: smartDraft.match, rules: smartDraft.rules });
            toast(`Smart shelf "${name}" updated`, 'success');
        } else {
            const ss: SmartShelf = {
                id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
                name,
                color: nextSmartColor,
                match: smartDraft.match,
                rules: smartDraft.rules,
            };
            addSmartShelf(ss);
            toast(`Smart shelf "${name}" created`, 'success');
        }

        setShowSmartCreate(false);
        setEditingSmartId(null);
        setSmartDraft({ name: '', match: 'all', rules: [newRuleDefault()] });
    };

    const handleSmartDelete = async (ss: SmartShelf) => {
        const yes = await confirm({ title: 'Delete Smart Shelf', message: `Delete "${ss.name}"?`, confirmLabel: 'Delete', danger: true });
        if (yes) {
            removeSmartShelf(ss.id);
            toast(`Smart shelf "${ss.name}" deleted`, 'info');
        }
    };

    const updateRule = (idx: number, rule: SmartShelfRule) => {
        setSmartDraft((prev) => {
            const rules = [...prev.rules];
            rules[idx] = rule;
            return { ...prev, rules };
        });
    };

    const removeRule = (idx: number) => {
        setSmartDraft((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== idx) }));
    };

    const addRule = () => {
        setSmartDraft((prev) => ({ ...prev, rules: [...prev.rules, newRuleDefault()] }));
    };

    const previewCount = showSmartCreate
        ? countSmartShelfMatches(books, { id: '', name: '', color: '', ...smartDraft })
        : 0;

    return (
        <div className={s.container}>
            {/* ---- Manual shelves ---- */}
            <div className={s.header}>
                <div className={s.headerLabel}>
                    <Tag size={16} style={{ color: 'var(--text-muted)' }} />
                    <span className={s.headerText}>Shelves</span>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className={`glass ${s.newBtn}`} aria-label="Create new shelf">
                    <Plus size={14} /> New Shelf
                </button>
            </div>

            {showCreate && (
                <div className={s.createRow}>
                    <input type="text" placeholder="Shelf name..." value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        className={`glass ${s.createInput}`} autoFocus />
                    <button onClick={handleCreate} disabled={!newName.trim()}
                        className={`${s.addBtn} ${newName.trim() ? s.addBtnActive : s.addBtnDisabled}`}>
                        <Check size={14} /> Add
                    </button>
                    <button onClick={() => { setShowCreate(false); setNewName(''); }} className={s.cancelCreateBtn}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {shelves.length === 0 && !showCreate && (
                <div className={s.empty}>No shelves yet. Create one to organize your books!</div>
            )}

            <div className={s.tags}>
                {shelves.map((shelf) => (
                    <div key={shelf.id} className={`glass ${s.tag}`}
                        style={{ borderLeft: `3px solid ${shelf.color}` }}>
                        {editingId === shelf.id ? (
                            <>
                                <input type="text" value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRename(shelf.id);
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    autoFocus className={s.renameInput} />
                                <button onClick={() => handleRename(shelf.id)} className={s.confirmRenameBtn}
                                    aria-label="Confirm rename"><Check size={12} /></button>
                            </>
                        ) : (
                            <>
                                <span className={s.shelfName} style={{ color: shelf.color }}>{shelf.name}</span>
                                <span className={s.shelfCount}>{countBooks(shelf.id)}</span>
                                <button onClick={() => { setEditingId(shelf.id); setEditName(shelf.name); }}
                                    className={s.shelfEditBtn} aria-label={`Rename ${shelf.name}`}>
                                    <Pencil size={11} />
                                </button>
                                <button onClick={() => handleDelete(shelf)} className={s.shelfDeleteBtn}
                                    aria-label={`Delete ${shelf.name}`}>
                                    <X size={12} />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* ---- Smart shelves ---- */}
            <div className={s.smartHeader}>
                <div className={s.headerLabel}>
                    <Zap size={15} style={{ color: '#f59e0b' }} />
                    <span className={s.headerText}>Smart Shelves</span>
                    <span className={s.smartHint}>Auto-match books by rules</span>
                </div>
                <button onClick={openSmartCreate} className={`glass ${s.newBtn}`} aria-label="Create new smart shelf">
                    <Plus size={14} /> New
                </button>
            </div>

            {smartShelves.length === 0 && !showSmartCreate && (
                <div className={s.empty}>No smart shelves yet. Create one to auto-group books by status, author, and more.</div>
            )}

            <div className={s.tags}>
                {smartShelves.map((ss) => {
                    const count = countSmartShelfMatches(books, ss);
                    return (
                        <div key={ss.id} className={`glass ${s.tag} ${s.smartTag}`}
                            style={{ borderLeft: `3px solid ${ss.color}` }}>
                            <Zap size={11} style={{ color: ss.color, flexShrink: 0 }} />
                            <span className={s.shelfName} style={{ color: ss.color }}>{ss.name}</span>
                            <span className={s.shelfCount}>{count}</span>
                            <button onClick={() => openSmartEdit(ss)} className={s.shelfEditBtn}
                                aria-label={`Edit ${ss.name}`}>
                                <Pencil size={11} />
                            </button>
                            <button onClick={() => handleSmartDelete(ss)} className={s.shelfDeleteBtn}
                                aria-label={`Delete ${ss.name}`}>
                                <Trash2 size={11} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {showSmartCreate && (
                <div className={`glass ${s.smartBuilder}`}>
                    <div className={s.smartBuilderHeader}>
                        <span className={s.smartBuilderTitle}>
                            {editingSmartId ? 'Edit Smart Shelf' : 'New Smart Shelf'}
                        </span>
                        <button onClick={() => setShowSmartCreate(false)} className={s.shelfDeleteBtn}
                            aria-label="Cancel">
                            <X size={14} />
                        </button>
                    </div>

                    <input type="text" placeholder="Shelf name..." value={smartDraft.name}
                        onChange={(e) => setSmartDraft({ ...smartDraft, name: e.target.value })}
                        className={`glass ${s.createInput}`} autoFocus />

                    <div className={s.matchRow}>
                        <span className={s.matchLabel}>Match</span>
                        <button
                            onClick={() => setSmartDraft({ ...smartDraft, match: 'all' })}
                            className={`${s.matchBtn} ${smartDraft.match === 'all' ? s.matchBtnActive : ''}`}>
                            All rules
                        </button>
                        <button
                            onClick={() => setSmartDraft({ ...smartDraft, match: 'any' })}
                            className={`${s.matchBtn} ${smartDraft.match === 'any' ? s.matchBtnActive : ''}`}>
                            Any rule
                        </button>
                    </div>

                    <div className={s.rulesList}>
                        {smartDraft.rules.map((rule, idx) => (
                            <RuleRow key={idx} rule={rule}
                                onChange={(r) => updateRule(idx, r)}
                                onRemove={() => removeRule(idx)} />
                        ))}
                    </div>

                    <div className={s.smartBuilderFooter}>
                        <button onClick={addRule} className={s.addRuleBtn}>
                            <Plus size={12} /> Add rule
                        </button>
                        <span className={s.previewCount}>
                            {previewCount} book{previewCount !== 1 ? 's' : ''} match
                        </span>
                        <button onClick={handleSmartSave}
                            disabled={!smartDraft.name.trim() || smartDraft.rules.length === 0}
                            className={`${s.addBtn} ${smartDraft.name.trim() ? s.addBtnActive : s.addBtnDisabled}`}>
                            <Check size={14} /> {editingSmartId ? 'Update' : 'Create'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShelfManager;
