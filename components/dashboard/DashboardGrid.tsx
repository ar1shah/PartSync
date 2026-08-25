"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import {
  Check,
  GripVertical,
  LayoutGrid,
  Plus,
  RotateCcw,
  Columns,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WIDGET_IDS,
  WIDGET_META,
  type WidgetId,
  type WidgetPlacement,
  type WidgetSpan,
} from "@/lib/dashboard/catalog";
import { saveDashboardLayout } from "@/app/admin/dashboard-actions";

const SPAN_CLASS: Record<WidgetSpan, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

interface Props {
  initial: WidgetPlacement[];
  nodes: Partial<Record<WidgetId, ReactNode>>;
}

export function DashboardGrid({ initial, nodes }: Props) {
  const [editing, setEditing] = useState(false);
  const [placements, setPlacements] = useState<WidgetPlacement[]>(initial);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const available = useMemo(
    () => WIDGET_IDS.filter((id) => !placements.some((p) => p.id === id)),
    [placements],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPlacements((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function cycleSpan(id: WidgetId) {
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, span: ((p.span % 3) + 1) as WidgetSpan } : p,
      ),
    );
  }

  function removeWidget(id: WidgetId) {
    setPlacements((prev) => prev.filter((p) => p.id !== id));
  }

  function addWidget(id: WidgetId) {
    setPlacements((prev) => [...prev, { id, span: WIDGET_META[id].defaultSpan }]);
    setShowPicker(false);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await saveDashboardLayout(placements);
        toast.success("Dashboard layout saved");
        setEditing(false);
        setShowPicker(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save layout");
      }
    });
  }

  function handleCancel() {
    setPlacements(initial);
    setEditing(false);
    setShowPicker(false);
  }

  function handleReset() {
    startTransition(async () => {
      try {
        await saveDashboardLayout(null);
        toast.success("Dashboard reset to default");
        setEditing(false);
        setShowPicker(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to reset layout");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <div className="relative mr-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPicker((s) => !s)}
                disabled={available.length === 0}
              >
                <Plus className="h-4 w-4" />
                Add widget
              </Button>
              {showPicker && available.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <ul className="max-h-80 overflow-y-auto">
                    {available.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => addWidget(id)}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                        >
                          <span className="mt-0.5 shrink-0 rounded-md bg-blue-50 p-1.5 text-blue-700">
                            {WIDGET_META[id].icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900">
                              {WIDGET_META[id].label}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {WIDGET_META[id].description}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={pending}>
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={pending}>
              <Check className="h-4 w-4" />
              Save layout
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <LayoutGrid className="h-4 w-4" />
            Customize
          </Button>
        )}
      </div>

      {placements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-10 text-center">
          <p className="text-sm font-medium text-slate-900">Your dashboard is empty</p>
          <p className="mt-1 text-xs text-slate-500">
            {editing ? "Use \u201cAdd widget\u201d to place a tile." : "Click Customize to add widgets."}
          </p>
        </div>
      ) : editing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={placements.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {placements.map((p) => (
                <SortableTile
                  key={p.id}
                  placement={p}
                  node={nodes[p.id]}
                  onCycleSpan={() => cycleSpan(p.id)}
                  onRemove={() => removeWidget(p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {placements.map((p) => (
            <div key={p.id} className={cn("min-w-0", SPAN_CLASS[p.span])}>
              {nodes[p.id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableTile({
  placement,
  node,
  onCycleSpan,
  onRemove,
}: {
  placement: WidgetPlacement;
  node: ReactNode;
  onCycleSpan: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: placement.id,
  });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  const meta = WIDGET_META[placement.id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative min-w-0 rounded-lg ring-2 ring-blue-200",
        SPAN_CLASS[placement.span],
        isDragging && "z-10 opacity-80",
      )}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-blue-100 bg-blue-50/90 px-2 py-1.5 backdrop-blur">
        <button
          type="button"
          className="flex cursor-grab items-center gap-1 text-xs font-medium text-blue-800 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
          <span className="truncate">{meta.label}</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCycleSpan}
            title="Change width"
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <Columns className="h-3.5 w-3.5" />
            {placement.span}/3
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove widget"
            className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Push the widget below the edit toolbar and keep it non-interactive
          while editing so drag/click controls win. */}
      <div className="pointer-events-none pt-9">
        {node ?? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-sm font-medium text-slate-900">{meta.label}</p>
            <p className="mt-1 text-xs text-slate-500">Save to load this widget.</p>
          </div>
        )}
      </div>
    </div>
  );
}
