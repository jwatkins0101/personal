import { spawn } from "child_process";
import type { EmailMessage } from "../gmail/types.js";
import type { DailyDigest, DigestItem, DigestOptions } from "./types.js";
import {
  getTodayEvents,
  getTomorrowEvents,
  formatEventTime,
} from "../calendar/apple.js";

const DEFAULT_ROLE_KEYWORDS = {
  university: [
    "edu",
    "student",
    "faculty",
    "professor",
    "class",
    "course",
    "assignment",
    "grade",
    "lecture",
    "campus",
    "academic",
    "school",
    "sacred-heart",
  ],
  startups: [
    "investor",
    "pitch",
    "funding",
    "startup",
    "product",
    "launch",
    "customer",
    "revenue",
    "venture",
    "founder",
    "business",
    "contract",
    "partnership",
  ],
  personal: [
    "family",
    "friend",
    "personal",
    "home",
    "appointment",
    "doctor",
    "health",
    "birthday",
    "holiday",
  ],
};

function buildDigestPrompt(emails: EmailMessage[]): string {
  const emailList = emails
    .map(
      (e, i) =>
        `${i + 1}. ID: ${e.id}
   From: ${e.from}
   Subject: ${e.subject}
   Snippet: ${e.snippet.substring(0, 300)}
   Date: ${e.date}`
    )
    .join("\n\n");

  return `You are an executive assistant creating a daily email digest. Analyze each email and extract actionable intelligence.

For each email, determine:
1. **Category**: urgent (needs action today), action_soon (needs action this week), waiting (awaiting response from others), info (FYI only), low_priority (newsletters/promos)
2. **Role context**: university (academic/school related), startups (business/ventures), personal (family/health/personal matters), general (everything else)
3. **Summary**: One sentence capturing the key point or decision needed
4. **Action**: What specific action is needed (reply, decide, approve, review, none)
5. **Owner**: Who needs to act - "me" or "other"
6. **Due date**: Extract any explicit or implied deadline (or null)

Also provide:
- A "today's focus" recommendation (one sentence on what to prioritize based on urgency and importance)

Emails to analyze:

${emailList}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "todaysFocus": "One sentence recommendation for today's priority",
  "items": [
    {
      "id": "email_id",
      "category": "urgent|action_soon|waiting|info|low_priority",
      "role": "university|startups|personal|general",
      "summary": "One sentence summary",
      "action": "reply|decide|approve|review|none",
      "owner": "me|other",
      "dueDate": "date string or null"
    }
  ]
}`;
}

interface ClaudeDigestResponse {
  todaysFocus: string;
  items: Array<{
    id: string;
    category: "urgent" | "action_soon" | "waiting" | "info" | "low_priority";
    role: "university" | "startups" | "personal" | "general";
    summary: string;
    action: string;
    owner: "me" | "other";
    dueDate: string | null;
  }>;
}

async function invokeClaudeForDigest(
  emails: EmailMessage[]
): Promise<ClaudeDigestResponse> {
  const prompt = buildDigestPrompt(emails);

  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--model",
      "sonnet",
    ];

    const claude = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    claude.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    claude.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    claude.on("close", (code) => {
      if (code !== 0) {
        console.error("Claude CLI stderr:", stderr);
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      try {
        const response = JSON.parse(stdout);
        let content: string;
        if (response.result) {
          content = response.result;
        } else if (response.content) {
          content = response.content;
        } else if (typeof response === "string") {
          content = response;
        } else {
          content = stdout;
        }

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }

        resolve(JSON.parse(jsonStr));
      } catch (err) {
        console.error("Failed to parse Claude response:", stdout);
        reject(new Error("Failed to parse Claude CLI response as JSON"));
      }
    });

    claude.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

export async function generateDigest(
  emails: EmailMessage[],
  options: DigestOptions
): Promise<DailyDigest> {
  // Fetch calendar events
  console.log("Fetching calendar events...");
  const [todayEvents, tomorrowEvents] = await Promise.all([
    getTodayEvents(),
    getTomorrowEvents(),
  ]);
  console.log(
    `Found ${todayEvents.length} events today, ${tomorrowEvents.length} tomorrow`
  );

  if (emails.length === 0) {
    return createEmptyDigest(todayEvents, tomorrowEvents);
  }

  console.log(`Analyzing ${emails.length} emails for digest...`);
  const analysis = await invokeClaudeForDigest(emails);

  // Build digest items with full email info
  const digestItems: DigestItem[] = analysis.items.map((item) => {
    const email = emails.find((e) => e.id === item.id);
    return {
      id: item.id,
      from: email?.from || "Unknown",
      subject: email?.subject || "No subject",
      summary: item.summary,
      action: item.action !== "none" ? item.action : undefined,
      owner: item.owner,
      dueDate: item.dueDate || undefined,
      category: item.category,
      role: item.role === "general" ? undefined : item.role,
      originalDate: email?.date || new Date().toISOString(),
    };
  });

  // Organize into sections
  const urgent = digestItems.filter((i) => i.category === "urgent");
  const actionSoon = digestItems.filter((i) => i.category === "action_soon");
  const waiting = digestItems.filter((i) => i.category === "waiting");
  const info = digestItems.filter((i) => i.category === "info");
  const lowPriority = digestItems.filter((i) => i.category === "low_priority");

  // Organize by role
  const university = digestItems.filter((i) => i.role === "university");
  const startups = digestItems.filter((i) => i.role === "startups");
  const personal = digestItems.filter((i) => i.role === "personal");

  const digest: DailyDigest = {
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    generatedAt: new Date().toISOString(),
    overview: {
      totalEmails: emails.length,
      urgentCount: urgent.length,
      actionCount: actionSoon.length,
      waitingCount: waiting.length,
      infoCount: info.length + lowPriority.length,
      todaysFocus: analysis.todaysFocus,
    },
    urgent,
    actionSoon,
    waitingOnOthers: waiting,
    byRole: {
      university,
      startups,
      personal,
    },
    fyi: [...info, ...lowPriority],
    todayMeetings: todayEvents.map((e) => ({
      title: e.title,
      time: formatEventTime(e),
      location: e.location,
      calendar: e.calendar,
      isAllDay: e.isAllDay,
    })),
    tomorrowMeetings: tomorrowEvents.map((e) => ({
      title: e.title,
      time: formatEventTime(e),
      location: e.location,
      calendar: e.calendar,
      isAllDay: e.isAllDay,
    })),
  };

  return digest;
}

function createEmptyDigest(
  todayEvents: Awaited<ReturnType<typeof getTodayEvents>> = [],
  tomorrowEvents: Awaited<ReturnType<typeof getTomorrowEvents>> = []
): DailyDigest {
  return {
    date: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    generatedAt: new Date().toISOString(),
    overview: {
      totalEmails: 0,
      urgentCount: 0,
      actionCount: 0,
      waitingCount: 0,
      infoCount: 0,
      todaysFocus: "No new emails to process. Enjoy your clear inbox!",
    },
    urgent: [],
    actionSoon: [],
    waitingOnOthers: [],
    byRole: {
      university: [],
      startups: [],
      personal: [],
    },
    fyi: [],
    todayMeetings: todayEvents.map((e) => ({
      title: e.title,
      time: formatEventTime(e),
      location: e.location,
      calendar: e.calendar,
      isAllDay: e.isAllDay,
    })),
    tomorrowMeetings: tomorrowEvents.map((e) => ({
      title: e.title,
      time: formatEventTime(e),
      location: e.location,
      calendar: e.calendar,
      isAllDay: e.isAllDay,
    })),
  };
}
