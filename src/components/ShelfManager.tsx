import React, { useState } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useToast } from './Toast.tsx';
import { SHELF_COLORS } from '../types.ts';
import type { Shelf } from '../types.ts';
import { Plus, X, Pencil, Check, Tag } from 'lucide-react';
import s from './ShelfManager.module.css';

const ShelfManager: React.FC = () => {
    const { shelves, books, addShelf, updateShelf, removeShelf } = useBookStore();
    const { toast, confirm } = useToast();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const nextColor = SHELF_COLORS[shelves.length % SHELF_COLORS.length];

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
        const yes = await confirm({
            title: 'Delete Shelf',
            message: msg,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (yes) {
            removeShelf(shelf.id);
            toast(`Shelf "${shelf.name}" deleted`, 'info');
        }
    };

    const countBooks = (shelfId: string) =>
        books.filter((b) => (b.shelfIds || []).includes(shelfId)).length;

    return (
        <div className={s.container}>
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
        </div>
    );
};

export default ShelfManager;
