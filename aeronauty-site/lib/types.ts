export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO datetime or YYYY-MM-DD for all-day
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarName: string;
  source: "google" | "apple";
  color?: string;
  location?: string;
  accountEmail?: string; // which Google account this belongs to
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  source: "google" | "apple";
  enabled: boolean;
  accountEmail?: string;
}

export interface Reminder {
  id: string;
  title: string;
  notes?: string;
  dueDate?: string;
  completed: boolean;
  completedDate?: string;
  listId: string;
  listName: string;
  priority?: number; // 0=none, 1=high, 5=medium, 9=low
}

export interface ReminderList {
  id: string;
  name: string;
  color?: string;
  reminders: Reminder[];
}
