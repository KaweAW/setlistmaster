import { useMemo, useState, type ReactNode } from 'react';
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { newId } from '../core/ids';
import {
  addBlock, addItem, itemsOfBlock, moveBlock, moveItem, removeBlock, removeItem, sortedBlocks, updateBlock,
  updateItem, updateSetlist, type OpContext, type SetlistTree,
} from '../core/setlistOps';
import type { Block, Performer, SetlistItem, Song, Tuning } from '../core/types';
import { useT } from '../i18n';
import type { SetlistEditorApi } from '../hooks/useSetlistEditor';
import { ItemEditorDialog } from './ItemEditorDialog';
import { SongPickerDialog } from './SongPickerDialog';
import { buildLookups, ItemBadges, TransitionLine, type Lookups } from './setlistParts';
import { RemoteFlash } from './RemoteFlash';
import { Button, Field, inputClass } from './ui';

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  tree: SetlistTree;
  songs: Song[];
  performers: Performer[];
  tunings: Tuning[];
  apply: SetlistEditorApi['apply'];
  createSong: SetlistEditorApi['createSong'];
}

type DragKind = 'item' | 'block';

/** Items compete with items (and empty-block drop zones); blocks only with blocks. */
const collisionDetection: CollisionDetection = (args) => {
  const kind = args.active.data.current?.type as DragKind | undefined;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const type = c.data.current?.type as string | undefined;
    return kind === 'block' ? type === 'block' : type === 'item' || type === 'drop';
  });
  return closestCenter({ ...args, droppableContainers });
};

const Grip = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
    {[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
  </svg>
);

export function SetlistEditor({ tree, songs, performers, tunings, apply, createSong }: Props) {
  const t = useT();
  const lookups = useMemo(() => buildLookups(songs, performers, tunings), [songs, performers, tunings]);
  // While dragging, the layout follows a draft; it becomes ONE history step when the drag ends.
  const [draft, setDraft] = useState<SetlistTree | null>(null);
  const [active, setActive] = useState<{ id: string; kind: DragKind } | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);
  const view = draft ?? tree;
  const blocks = sortedBlocks(view);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragCtx = (): OpContext => ({ bandId: tree.setlist.bandId, now: Date.now(), newId });

  function onDragStart(e: DragStartEvent) {
    setActive({ id: String(e.active.id), kind: e.active.data.current?.type as DragKind });
  }

  /** An item hovering over another block moves there right away, so the list opens a gap. */
  function onDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (!over || a.data.current?.type !== 'item') return;
    const base = draft ?? tree;
    const dragged = base.items.find((i) => i.id === a.id);
    if (!dragged) return;
    const overType = over.data.current?.type as string | undefined;
    const overItem = overType === 'item' ? base.items.find((i) => i.id === over.id) : undefined;
    const targetBlockId = overItem?.blockId ?? (overType === 'drop' ? (over.data.current?.blockId as string) : undefined);
    if (!targetBlockId || targetBlockId === dragged.blockId) return;

    const destination = itemsOfBlock(base, targetBlockId);
    let index = destination.length;
    if (overItem) {
      const translated = a.rect.current.translated;
      const below = translated ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2 : false;
      index = destination.findIndex((i) => i.id === overItem.id) + (below ? 1 : 0);
    }
    setDraft(moveItem(base, dragCtx(), dragged.id, targetBlockId, index));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    const base = draft ?? tree;
    setDraft(null);
    setActive(null);
    if (!over) return; // dropped outside: the draft is discarded

    let next = base;
    if (a.data.current?.type === 'block') {
      const to = sortedBlocks(base).findIndex((b) => b.id === over.id);
      if (to >= 0) next = moveBlock(base, dragCtx(), String(a.id), to);
    } else if (over.data.current?.type === 'item' && over.id !== a.id) {
      const dragged = base.items.find((i) => i.id === a.id);
      const target = base.items.find((i) => i.id === over.id);
      if (dragged && target && dragged.blockId === target.blockId) {
        const list = itemsOfBlock(base, dragged.blockId);
        const to = list.findIndex((i) => i.id === target.id);
        next = moveItem(base, dragCtx(), dragged.id, dragged.blockId, to);
      }
    }
    if (next !== tree) apply(() => next);
  }

  const resetDrag = () => {
    setDraft(null);
    setActive(null);
  };

  const editingItem = editingItemId ? tree.items.find((i) => i.id === editingItemId) : undefined;
  const editingSong = editingItem ? lookups.songs.get(editingItem.songId) : undefined;

  return (
    <div className="space-y-5">
      <SetlistDetails tree={tree} apply={apply} />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                items={itemsOfBlock(view, block.id)}
                lookups={lookups}
                activeId={active?.id}
                onRename={(patch) => apply((tr, ctx) => updateBlock(tr, ctx, block.id, patch))}
                onRemove={() => {
                  const count = itemsOfBlock(tree, block.id).length;
                  if (count > 0 && !window.confirm(t('edit.removeBlockConfirm', { name: block.name, n: count }))) return;
                  apply((tr) => removeBlock(tr, block.id));
                }}
                onEditItem={setEditingItemId}
                onAddSong={() => setPickerBlockId(block.id)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={reducedMotion() ? null : { duration: 180, easing: 'ease-out' }}>
          {active?.kind === 'item' && (
            <ItemCard item={view.items.find((i) => i.id === active.id)} lookups={lookups} floating />
          )}
          {active?.kind === 'block' && (
            <div className="rounded-lg border border-ink bg-surface px-4 py-3 font-display text-lg font-bold uppercase shadow-lg">
              {view.blocks.find((b) => b.id === active.id)?.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Button
        variant="secondary"
        onClick={() =>
          apply((tr, ctx) => addBlock(tr, ctx, t('block.defaultName', { n: tr.blocks.length + 1 })))
        }
      >
        + {t('edit.addBlock')}
      </Button>

      {editingItem && editingSong && (
        <ItemEditorDialog
          item={editingItem}
          song={editingSong}
          performers={performers}
          tunings={tunings}
          onClose={() => setEditingItemId(null)}
          onSave={(patch) => {
            apply((tr, ctx) => updateItem(tr, ctx, editingItem.id, patch));
            setEditingItemId(null);
          }}
          onRemove={() => {
            apply((tr) => removeItem(tr, editingItem.id));
            setEditingItemId(null);
          }}
        />
      )}

      {pickerBlockId && (
        <SongPickerDialog
          songs={songs}
          inSetlist={new Set(tree.items.map((i) => i.songId))}
          onAdd={(songId) => apply((tr, ctx) => addItem(tr, ctx, pickerBlockId, songId))}
          onCreate={createSong}
          onClose={() => setPickerBlockId(null)}
        />
      )}
    </div>
  );
}

/** Title, date and venue. Each field is saved when it loses focus (one undo step per change). */
function SetlistDetails({ tree, apply }: Pick<Props, 'tree' | 'apply'>) {
  const t = useT();
  const { setlist } = tree;
  return (
    <div key={setlist.updatedAt} className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_2fr]">
      <Field label={t('field.title')}>
        <input
          className={inputClass}
          defaultValue={setlist.title}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (!title) e.target.value = setlist.title;
            else if (title !== setlist.title) apply((tr, ctx) => updateSetlist(tr, ctx, { title }));
          }}
        />
      </Field>
      <Field label={t('field.date')}>
        <input
          type="date"
          className={inputClass}
          defaultValue={setlist.date ?? ''}
          onBlur={(e) => {
            const date = e.target.value || undefined;
            if (date !== setlist.date) apply((tr, ctx) => updateSetlist(tr, ctx, { date }));
          }}
        />
      </Field>
      <Field label={t('field.venue')}>
        <input
          className={inputClass}
          defaultValue={setlist.venue}
          onBlur={(e) => {
            if (e.target.value !== setlist.venue) apply((tr, ctx) => updateSetlist(tr, ctx, { venue: e.target.value }));
          }}
        />
      </Field>
    </div>
  );
}

function SortableBlock({
  block, items, lookups, activeId, onRename, onRemove, onEditItem, onAddSong,
}: {
  block: Block;
  items: SetlistItem[];
  lookups: Lookups;
  activeId: string | undefined;
  onRename: (patch: { name?: string; subtitle?: string; reserve?: boolean }) => void;
  onRemove: () => void;
  onEditItem: (id: string) => void;
  onAddSong: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, data: { type: 'block' } });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border p-3 ${block.reserve ? 'border-dashed border-soft/60 bg-line/20' : 'border-line bg-white/60'} ${isDragging ? 'opacity-40' : ''}`}
    >
      <div key={block.updatedAt} className="mb-2 flex items-start gap-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={t('edit.dragBlock')}
          className="grid h-11 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-soft hover:bg-line/40"
        >
          <Grip />
        </button>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <input
            className={`${inputClass} font-display text-lg font-bold uppercase tracking-wide`}
            aria-label={t('edit.blockName')}
            defaultValue={block.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name) e.target.value = block.name;
              else if (name !== block.name) onRename({ name });
            }}
          />
          <input
            className={inputClass}
            aria-label={t('edit.blockSubtitle')}
            placeholder={t('edit.blockSubtitle')}
            defaultValue={block.subtitle}
            onBlur={(e) => e.target.value !== block.subtitle && onRename({ subtitle: e.target.value })}
          />
        </div>
        <Button variant="danger" aria-label={`${t('edit.removeBlock')}: ${block.name}`} onClick={onRemove}>
          ✕
        </Button>
      </div>

      <label className="mb-2 ml-[3.25rem] flex items-center gap-2 text-sm text-soft">
        <input type="checkbox" checked={block.reserve} onChange={(e) => onRename({ reserve: e.target.checked })} className="h-5 w-5" />
        {t('edit.reserve')}
      </label>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          <EmptyDropZone blockId={block.id}>{t('edit.emptyBlock')}</EmptyDropZone>
        ) : (
          items.map((item, index) => (
            <SortableItemRow
              key={item.id}
              item={item}
              index={index}
              lookups={lookups}
              hidden={item.id === activeId}
              onEdit={() => onEditItem(item.id)}
            />
          ))
        )}
      </SortableContext>

      <Button variant="secondary" className="mt-2" onClick={onAddSong}>
        + {t('edit.addSong')}
      </Button>
    </section>
  );
}

function EmptyDropZone({ blockId, children }: { blockId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${blockId}`, data: { type: 'drop', blockId } });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-dashed px-3 py-5 text-center text-sm text-soft ${
        isOver ? 'border-io bg-io/5' : 'border-line'
      }`}
    >
      {children}
    </div>
  );
}

function SortableItemRow({
  item, index, lookups, hidden, onEdit,
}: {
  item: SetlistItem;
  index: number;
  lookups: Lookups;
  hidden: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  const song = lookups.songs.get(item.songId);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: item.id,
    data: { type: 'item' },
  });
  if (!song) return null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative grid grid-cols-[44px_28px_1fr] items-start gap-x-1 border-b border-line/70 py-2 last:border-b-0 ${hidden ? 'opacity-30' : ''}`}
    >
      <RemoteFlash id={item.id} />
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={t('edit.dragSong')}
        className="grid h-11 w-11 cursor-grab touch-none place-items-center rounded-md text-soft hover:bg-line/40"
      >
        <Grip />
      </button>
      <div className="pt-2.5 text-right font-display text-xl font-bold leading-none text-line">{index + 1}</div>
      <div className="min-w-0 pl-2">
        <button type="button" onClick={onEdit} className="block min-h-[44px] w-full text-left">
          <span className="text-[16.5px] font-semibold leading-tight">{song.title}</span>{' '}
          <span className="text-[12.5px] text-soft">· {song.artist}</span>
          <ItemBadges item={item} song={song} lookups={lookups} className="mt-1 justify-start" />
        </button>
        <TransitionLine item={item} className="mb-1" />
      </div>
    </div>
  );
}

/** Static copy of a row, shown under the finger while dragging. */
function ItemCard({ item, lookups, floating }: { item: SetlistItem | undefined; lookups: Lookups; floating?: boolean }) {
  const song = item ? lookups.songs.get(item.songId) : undefined;
  if (!item || !song) return null;
  return (
    <div className={`rounded-lg border border-ink bg-surface px-4 py-3 ${floating ? 'shadow-lg' : ''}`}>
      <div className="text-[16.5px] font-semibold leading-tight">{song.title}</div>
      <div className="text-[12.5px] text-soft">{song.artist}</div>
    </div>
  );
}
