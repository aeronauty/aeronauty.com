"use client";

import { useState } from "react";
import { Check, Plus, Trash2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { ReminderList } from "@/lib/types";

interface Props {
  lists: ReminderList[];
  onComplete: (listId: string, reminderId: string) => void;
  onAdd: (listId: string, title: string, dueDate?: string) => void;
  onDelete: (listId: string, reminderId: string) => void;
}

export default function RemindersWidget({ lists, onComplete, onAdd, onDelete }: Props) {
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set(lists.map((l) => l.id)));
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const toggleList = (id: string) => {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = (listId: string) => {
    if (!newTitle.trim()) return;
    onAdd(listId, newTitle.trim());
    setNewTitle("");
    setAddingTo(null);
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const formatDue = (dueDate?: string) => {
    if (!dueDate) return null;
    const d = new Date(dueDate);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / 86400000);

    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days <= 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (lists.length === 0) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl p-4 h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm text-center">
          No reminder lists found.<br />
          Configure Apple CalDAV in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-semibold mb-3 drag-handle cursor-grab">Reminders</h2>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 -mr-1">
        {lists.map((list) => {
          const isExpanded = expandedLists.has(list.id);
          const incomplete = list.reminders.filter((r) => !r.completed);
          const count = incomplete.length;

          return (
            <div key={list.id}>
              <button
                onClick={() => toggleList(list.id)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color ?? "#ff9500" }}
                />
                <span className="font-medium text-sm flex-1 text-left truncate">{list.name}</span>
                {list.source === "google" && (
                  <span className="text-[9px] text-gray-600 uppercase flex-shrink-0">G</span>
                )}
                <span className="text-xs text-gray-500">{count}</span>
              </button>

              {isExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {incomplete.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center gap-2 group p-2 rounded-lg hover:bg-gray-800/50"
                    >
                      <button
                        onClick={() => onComplete(list.id, reminder.id)}
                        className={`
                          w-6 h-6 rounded-full border-2 flex items-center justify-center
                          flex-shrink-0 touch-manipulation transition-colors
                          ${reminder.completed
                            ? "bg-green-600 border-green-600"
                            : "border-gray-600 hover:border-gray-400"
                          }
                        `}
                      >
                        {reminder.completed && <Check className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${reminder.completed ? "line-through text-gray-500" : ""}`}>
                          {reminder.title}
                        </div>
                        {reminder.dueDate && (
                          <div
                            className={`text-xs flex items-center gap-1 mt-0.5 ${
                              isOverdue(reminder.dueDate) ? "text-red-400" : "text-gray-500"
                            }`}
                          >
                            {isOverdue(reminder.dueDate) && <AlertCircle className="w-3 h-3" />}
                            {formatDue(reminder.dueDate)}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => onDelete(list.id, reminder.id)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-900/50 transition-opacity touch-manipulation"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}

                  {addingTo === list.id ? (
                    <div className="flex items-center gap-2 p-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAdd(list.id);
                          if (e.key === "Escape") setAddingTo(null);
                        }}
                        placeholder="New reminder..."
                        className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo(list.id)}
                      className="flex items-center gap-2 p-2 text-sm text-gray-500 hover:text-gray-300 touch-manipulation"
                    >
                      <Plus className="w-4 h-4" />
                      Add reminder
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
