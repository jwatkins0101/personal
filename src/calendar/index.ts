import { spawn } from "child_process";
import { calendarManager, CalendarManager } from "./manager.js";
import { getTodayEvents, getTomorrowEvents, formatEventTime } from "./apple.js";
import type { CalendarEvent } from "./apple.js";
import type { DayAnalysis, WeeklyReview, EventSuggestion, EventCategory } from "./types.js";

type Command = "analyze" | "review" | "suggest" | "gaps" | "create";

function parseArgs(): {
  command: Command;
  task?: string;
  duration?: number;
  category?: EventCategory;
} {
  const args = process.argv.slice(2);
  const command = (args[0] || "analyze") as Command;

  let task: string | undefined;
  let duration: number | undefined;
  let category: EventCategory | undefined;

  const taskIdx = args.indexOf("--task");
  if (taskIdx !== -1) task = args[taskIdx + 1];

  const durIdx = args.indexOf("--duration");
  if (durIdx !== -1) duration = parseInt(args[durIdx + 1]);

  const catIdx = args.indexOf("--category");
  if (catIdx !== -1) category = args[catIdx + 1] as EventCategory;

  return { command, task, duration, category };
}

async function main(): Promise<void> {
  const { command, task, duration, category } = parseArgs();

  console.log(`[Calendar Manager] Running: ${command}`);
  console.log("=".repeat(50));

  try {
    const todayEvents = await getTodayEvents();
    const tomorrowEvents = await getTomorrowEvents();

    switch (command) {
      case "analyze": {
        const today = new Date().toISOString().split("T")[0];
        const analysis = calendarManager.analyzeDay(today, todayEvents);
        printDayAnalysis(analysis, todayEvents);
        break;
      }

      case "review": {
        // For now, analyze today and tomorrow as a mini-review
        const weekEvents = new Map<string, CalendarEvent[]>();
        const today = new Date();
        weekEvents.set(today.toISOString().split("T")[0], todayEvents);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        weekEvents.set(tomorrow.toISOString().split("T")[0], tomorrowEvents);

        const review = calendarManager.weeklyReview(weekEvents);
        printWeeklyReview(review);
        break;
      }

      case "suggest": {
        if (!task) {
          console.log("Usage: --task 'Task name' [--duration 60] [--category focus]");
          return;
        }
        const estDuration = duration || calendarManager.estimateDuration(task);
        const cat = category || "focus";
        const suggestion = calendarManager.suggestTimeBlock(task, estDuration, cat, todayEvents);
        printSuggestion(suggestion);
        break;
      }

      case "gaps": {
        const gaps = calendarManager.findGaps(todayEvents, 30);
        printGaps(gaps);
        break;
      }

      case "create": {
        if (!task) {
          console.log("Usage: --task 'Event title' --duration 60");
          return;
        }
        const script = calendarManager.generateCreateEventScript(
          task,
          new Date(),
          new Date(Date.now() + (duration || 60) * 60000)
        );
        console.log("\nAppleScript to create event:");
        console.log("-".repeat(50));
        console.log(script);
        console.log("-".repeat(50));
        console.log("\nRun this in Script Editor or via osascript to create the event.");
        break;
      }
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  }
}

function printDayAnalysis(analysis: DayAnalysis, events: CalendarEvent[]): void {
  console.log(`\n📅 DAY ANALYSIS: ${analysis.date}`);
  console.log("-".repeat(50));

  // Events list
  if (events.length > 0) {
    console.log("\n📋 Today's Events:");
    events.forEach(e => {
      const time = formatEventTime(e);
      console.log(`  • ${time} - ${e.title}`);
      if (e.location) console.log(`    📍 ${e.location}`);
    });
  } else {
    console.log("\n📋 No events scheduled today.");
  }

  // Stats
  console.log("\n📊 Stats:");
  console.log(`  Meetings: ${analysis.totalMeetings}`);
  console.log(`  Focus time: ${analysis.totalFocusTime} min`);
  console.log(`  Buffer time: ${analysis.totalBufferTime} min`);
  console.log(`  Scheduled: ${analysis.scheduledHours.toFixed(1)} hrs`);
  console.log(`  Free: ${analysis.freeHours.toFixed(1)} hrs`);

  // Status
  if (analysis.overloaded) {
    console.log("\n⚠️  DAY IS OVERLOADED");
  } else {
    console.log("\n✅ Day looks manageable");
  }

  // Suggestions
  if (analysis.suggestions.length > 0) {
    console.log("\n💡 Suggestions:");
    analysis.suggestions.forEach(s => console.log(`  • ${s}`));
  }

  // Available gaps
  if (analysis.gaps.length > 0) {
    console.log("\n🕐 Available time slots:");
    analysis.gaps.forEach(g => {
      console.log(`  • ${g.start} - ${g.end} (${g.duration} min)`);
    });
  }
}

function printWeeklyReview(review: WeeklyReview): void {
  console.log(`\n📊 WEEKLY REVIEW: Week of ${review.weekOf}`);
  console.log("-".repeat(50));

  console.log("\n📈 Overview:");
  console.log(`  Total meetings: ${review.totalMeetings}`);
  console.log(`  Focus blocks: ${review.totalFocusBlocks}`);
  console.log(`  Avg daily load: ${review.averageDailyLoad.toFixed(1)} hrs`);
  console.log(`  Busiest day: ${review.busiestDay}`);
  console.log(`  Lightest day: ${review.lightestDay}`);

  if (review.recommendations.length > 0) {
    console.log("\n💡 Recommendations:");
    review.recommendations.forEach(r => console.log(`  • ${r}`));
  }

  console.log("\n📅 Day-by-day:");
  review.daysAnalyzed.forEach(day => {
    const status = day.overloaded ? "⚠️" : "✅";
    console.log(`  ${status} ${day.date}: ${day.totalMeetings} meetings, ${day.scheduledHours.toFixed(1)}hrs scheduled`);
  });
}

function printSuggestion(suggestion: EventSuggestion): void {
  console.log("\n💡 TIME BLOCK SUGGESTION");
  console.log("-".repeat(50));
  console.log(`  Task: ${suggestion.title}`);
  console.log(`  Duration: ${suggestion.duration} min`);
  console.log(`  Category: ${suggestion.category}`);
  console.log(`  Priority: ${suggestion.priority}`);
  if (suggestion.suggestedTime) {
    console.log(`  Suggested time: ${suggestion.suggestedTime}`);
  }
  console.log(`  Reason: ${suggestion.reason}`);
}

function printGaps(gaps: Array<{ start: string; end: string; duration: number }>): void {
  console.log("\n🕐 AVAILABLE TIME GAPS");
  console.log("-".repeat(50));

  if (gaps.length === 0) {
    console.log("  No significant gaps found in today's schedule.");
    return;
  }

  gaps.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.start} - ${g.end}`);
    console.log(`     Duration: ${g.duration} min`);
    if (g.duration >= 90) {
      console.log("     ✨ Great for deep focus work");
    } else if (g.duration >= 45) {
      console.log("     📝 Good for tasks or short meetings");
    } else {
      console.log("     ☕ Quick break or admin tasks");
    }
  });
}

main();
