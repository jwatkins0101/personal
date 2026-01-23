import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  CalendarEvent,
  DayAnalysis,
  WeeklyReview,
  TimeBlock,
  EventCategory,
  CalendarConfig,
  EventSuggestion,
} from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, "../../scripts");

// Duration estimates for common task types (in minutes)
const DURATION_ESTIMATES: Record<string, number> = {
  meeting: 60,
  "1:1": 30,
  standup: 15,
  review: 45,
  planning: 60,
  writing: 90,
  coding: 120,
  reading: 45,
  email: 30,
  admin: 30,
  exercise: 60,
  lunch: 60,
  break: 15,
};

export class CalendarManager {
  private config: CalendarConfig;

  constructor(config: Partial<CalendarConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a well-formatted event title based on best practices
   */
  formatEventTitle(
    action: string,
    subject: string,
    context?: string
  ): string {
    // Make it specific and actionable
    const title = `${action} ${subject}`;
    return context ? `${title} (${context})` : title;
  }

  /**
   * Estimate realistic duration for a task
   */
  estimateDuration(taskType: string, complexity: "simple" | "normal" | "complex" = "normal"): number {
    const baseEstimate = DURATION_ESTIMATES[taskType.toLowerCase()] || 60;
    const multipliers = { simple: 0.75, normal: 1, complex: 1.5 };
    // Add 20% buffer for underestimation tendency
    return Math.ceil(baseEstimate * multipliers[complexity] * 1.2);
  }

  /**
   * Suggest optimal time blocks for a task
   */
  suggestTimeBlock(
    task: string,
    duration: number,
    category: EventCategory,
    existingEvents: CalendarEvent[]
  ): EventSuggestion {
    const gaps = this.findGaps(existingEvents, duration);

    // Prefer morning for focus work
    let suggestedTime: string | undefined;
    if (category === "focus" || category === "research" || category === "writing") {
      const morningGap = gaps.find(g => {
        const hour = parseInt(g.start.split(":")[0]);
        return hour >= 9 && hour < 12;
      });
      suggestedTime = morningGap?.start;
    }

    // Otherwise, use first available gap
    if (!suggestedTime && gaps.length > 0) {
      suggestedTime = gaps[0].start;
    }

    return {
      title: task,
      duration,
      category,
      priority: this.getPriority(category),
      suggestedTime,
      reason: suggestedTime
        ? `Found ${duration}min gap at ${suggestedTime}`
        : "No suitable gap found today",
    };
  }

  /**
   * Find gaps in the schedule
   */
  findGaps(
    events: CalendarEvent[],
    minDuration: number = 30
  ): Array<{ start: string; end: string; duration: number }> {
    const { start: workStart, end: workEnd } = this.config.workingHours;
    const gaps: Array<{ start: string; end: string; duration: number }> = [];

    // Sort events by start time
    const sorted = [...events]
      .filter(e => !e.isAllDay)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (sorted.length === 0) {
      // Entire working day is free
      const duration = this.timeDiffMinutes(workStart, workEnd);
      if (duration >= minDuration) {
        gaps.push({ start: workStart, end: workEnd, duration });
      }
      return gaps;
    }

    // Check gap before first event
    const firstEventStart = this.extractTime(sorted[0].startTime);
    if (firstEventStart > workStart) {
      const duration = this.timeDiffMinutes(workStart, firstEventStart);
      if (duration >= minDuration) {
        gaps.push({ start: workStart, end: firstEventStart, duration });
      }
    }

    // Check gaps between events
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = this.extractTime(sorted[i].endTime);
      const nextStart = this.extractTime(sorted[i + 1].startTime);
      const duration = this.timeDiffMinutes(currentEnd, nextStart);
      if (duration >= minDuration) {
        gaps.push({ start: currentEnd, end: nextStart, duration });
      }
    }

    // Check gap after last event
    const lastEventEnd = this.extractTime(sorted[sorted.length - 1].endTime);
    if (lastEventEnd < workEnd) {
      const duration = this.timeDiffMinutes(lastEventEnd, workEnd);
      if (duration >= minDuration) {
        gaps.push({ start: lastEventEnd, end: workEnd, duration });
      }
    }

    return gaps;
  }

  /**
   * Analyze a day's calendar for load and suggestions
   */
  analyzeDay(date: string, events: CalendarEvent[]): DayAnalysis {
    const meetingEvents = events.filter(e =>
      !e.isAllDay && !e.title.toLowerCase().includes("focus") && !e.title.toLowerCase().includes("block")
    );
    const focusBlocks = events.filter(e =>
      e.title.toLowerCase().includes("focus") || e.title.toLowerCase().includes("deep work")
    );
    const bufferBlocks = events.filter(e =>
      e.title.toLowerCase().includes("buffer") || e.title.toLowerCase().includes("break")
    );

    const totalMeetings = meetingEvents.length;
    const totalFocusTime = this.sumDurations(focusBlocks);
    const totalBufferTime = this.sumDurations(bufferBlocks);
    const scheduledHours = this.sumDurations(events) / 60;

    const workingHoursTotal = this.timeDiffMinutes(
      this.config.workingHours.start,
      this.config.workingHours.end
    ) / 60;
    const freeHours = workingHoursTotal - scheduledHours;

    const gaps = this.findGaps(events, 15);
    const overloaded = totalMeetings > this.config.maxMeetingsPerDay || freeHours < 1;

    const suggestions: string[] = [];

    if (totalMeetings > this.config.maxMeetingsPerDay) {
      suggestions.push(`Consider rescheduling some meetings - you have ${totalMeetings} (max recommended: ${this.config.maxMeetingsPerDay})`);
    }

    if (totalFocusTime < 60) {
      suggestions.push("Schedule at least 60-90 minutes of focused work time");
    }

    if (totalBufferTime < 30) {
      suggestions.push("Add buffer time between meetings for transitions and breaks");
    }

    // Check for back-to-back meetings
    const backToBack = this.checkBackToBack(events);
    if (backToBack > 2) {
      suggestions.push(`${backToBack} back-to-back meetings detected - add 15min buffers`);
    }

    return {
      date,
      totalMeetings,
      totalFocusTime,
      totalBufferTime,
      scheduledHours,
      freeHours,
      overloaded,
      gaps,
      suggestions,
    };
  }

  /**
   * Perform a weekly calendar review
   */
  weeklyReview(weekEvents: Map<string, CalendarEvent[]>): WeeklyReview {
    const daysAnalyzed: DayAnalysis[] = [];
    let totalMeetings = 0;
    let totalFocusBlocks = 0;
    let totalHours = 0;

    const days = Array.from(weekEvents.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [date, events] of days) {
      const analysis = this.analyzeDay(date, events);
      daysAnalyzed.push(analysis);
      totalMeetings += analysis.totalMeetings;
      totalFocusBlocks += analysis.totalFocusTime > 0 ? 1 : 0;
      totalHours += analysis.scheduledHours;
    }

    const averageDailyLoad = totalHours / Math.max(days.length, 1);

    const sortedByLoad = [...daysAnalyzed].sort((a, b) => b.scheduledHours - a.scheduledHours);
    const busiestDay = sortedByLoad[0]?.date || "N/A";
    const lightestDay = sortedByLoad[sortedByLoad.length - 1]?.date || "N/A";

    const recommendations: string[] = [];

    if (averageDailyLoad > 7) {
      recommendations.push("Your average daily load is over 7 hours - consider delegating or rescheduling");
    }

    if (totalFocusBlocks < 3) {
      recommendations.push("Schedule more dedicated focus time blocks throughout the week");
    }

    const overloadedDays = daysAnalyzed.filter(d => d.overloaded);
    if (overloadedDays.length > 2) {
      recommendations.push(`${overloadedDays.length} days are overloaded - redistribute tasks`);
    }

    // Check for meeting-heavy days
    const meetingHeavyDays = daysAnalyzed.filter(d => d.totalMeetings > 4);
    if (meetingHeavyDays.length > 0) {
      recommendations.push(`Consider a "no meeting" day to batch meetings on other days`);
    }

    return {
      weekOf: days[0]?.[0] || new Date().toISOString().split("T")[0],
      daysAnalyzed,
      totalMeetings,
      totalFocusBlocks,
      averageDailyLoad,
      busiestDay,
      lightestDay,
      recommendations,
      unfinishedItems: [], // Would need task tracking integration
    };
  }

  /**
   * Generate AppleScript to create a calendar event
   */
  generateCreateEventScript(
    title: string,
    startDate: Date,
    endDate: Date,
    calendarName: string = "Calendar",
    location?: string
  ): string {
    const formatDate = (d: Date) => d.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    let script = `
tell application "Calendar"
  tell calendar "${calendarName}"
    make new event with properties {summary:"${title}", start date:date "${formatDate(startDate)}", end date:date "${formatDate(endDate)}"`;

    if (location) {
      script += `, location:"${location}"`;
    }

    script += `}
  end tell
end tell`;

    return script;
  }

  // Helper methods
  private extractTime(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toTimeString().slice(0, 5);
    } catch {
      return "09:00";
    }
  }

  private timeDiffMinutes(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }

  private sumDurations(events: CalendarEvent[]): number {
    return events.reduce((sum, e) => {
      if (e.isAllDay) return sum;
      const start = new Date(e.startTime).getTime();
      const end = new Date(e.endTime).getTime();
      return sum + (end - start) / 60000;
    }, 0);
  }

  private checkBackToBack(events: CalendarEvent[]): number {
    const sorted = [...events]
      .filter(e => !e.isAllDay)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    let count = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = new Date(sorted[i].endTime).getTime();
      const nextStart = new Date(sorted[i + 1].startTime).getTime();
      if (nextStart - currentEnd < 10 * 60000) { // Less than 10 minutes
        count++;
      }
    }
    return count;
  }

  private getPriority(category: EventCategory): "high" | "medium" | "low" {
    const p = this.config.categories[category]?.priority || 3;
    if (p <= 2) return "high";
    if (p <= 4) return "medium";
    return "low";
  }
}

export const calendarManager = new CalendarManager();
