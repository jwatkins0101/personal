export interface CalendarEvent {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  calendar?: string;
  isAllDay: boolean;
}

export interface EventSuggestion {
  title: string;
  duration: number; // minutes
  category: EventCategory;
  priority: "high" | "medium" | "low";
  suggestedTime?: string;
  reason?: string;
}

export type EventCategory =
  | "teaching"
  | "research"
  | "business"
  | "personal"
  | "health"
  | "family"
  | "admin"
  | "focus"
  | "meeting"
  | "buffer"
  | "writing"
  | "coding";

export interface TimeBlock {
  title: string;
  category: EventCategory;
  startTime: string;
  endTime: string;
  duration: number;
  isBuffer: boolean;
}

export interface DayAnalysis {
  date: string;
  totalMeetings: number;
  totalFocusTime: number; // minutes
  totalBufferTime: number; // minutes
  scheduledHours: number;
  freeHours: number;
  overloaded: boolean;
  gaps: Array<{ start: string; end: string; duration: number }>;
  suggestions: string[];
}

export interface WeeklyReview {
  weekOf: string;
  daysAnalyzed: DayAnalysis[];
  totalMeetings: number;
  totalFocusBlocks: number;
  averageDailyLoad: number; // hours
  busiestDay: string;
  lightestDay: string;
  recommendations: string[];
  unfinishedItems: string[];
}

export interface CalendarConfig {
  workingHours: { start: string; end: string };
  preferredFocusTime: "morning" | "afternoon" | "evening";
  bufferBetweenMeetings: number; // minutes
  maxMeetingsPerDay: number;
  categories: Record<EventCategory, { color: string; priority: number }>;
}

export const DEFAULT_CONFIG: CalendarConfig = {
  workingHours: { start: "09:00", end: "18:00" },
  preferredFocusTime: "morning",
  bufferBetweenMeetings: 15,
  maxMeetingsPerDay: 6,
  categories: {
    teaching: { color: "blue", priority: 1 },
    research: { color: "purple", priority: 2 },
    business: { color: "green", priority: 2 },
    meeting: { color: "orange", priority: 3 },
    focus: { color: "red", priority: 1 },
    personal: { color: "cyan", priority: 4 },
    health: { color: "pink", priority: 2 },
    family: { color: "yellow", priority: 3 },
    admin: { color: "gray", priority: 5 },
    buffer: { color: "lightgray", priority: 6 },
    writing: { color: "teal", priority: 2 },
    coding: { color: "indigo", priority: 2 },
  },
};
