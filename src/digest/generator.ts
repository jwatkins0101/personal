import { spawn } from "child_process";
import type { EmailMessage } from "../mail/types.js";
import type { DailyDigest, DigestItem, DigestOptions, MessageDigestItem } from "./types.js";
import {
  getTodayEvents,
  getTomorrowEvents,
  formatEventTime,
} from "../calendar/apple.js";
import { messagesClient, type Message } from "../messages/index.js";

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

function buildMessageDigestPrompt(messages: Message[]): string {
  const messageList = messages
    .map(
      (m, i) =>
        `${i + 1}. ID: ${m.id}
   From: ${m.handleId}
   Text: ${m.text.substring(0, 500)}
   Date: ${m.date.toISOString()}
   Is Reply Thread: ${m.threadOriginatorGuid ? "yes" : "no"}`
    )
    .join("\n\n");

  return `You are an executive assistant analyzing text messages (iMessage/SMS) to identify important items.

For each message, determine:
1. **Category**: urgent (needs immediate response), needs_reply (should respond soon), fyi (informational), personal (casual/social)
2. **Summary**: One brief sentence capturing what this message is about or needs
3. **Action**: What response or action is needed (reply, call, none)

Focus on identifying:
- Messages that need a response (questions, requests)
- Time-sensitive information
- Important updates from key contacts

Messages to analyze:

${messageList}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "items": [
    {
      "id": message_id_number,
      "category": "urgent|needs_reply|fyi|personal",
      "summary": "Brief summary",
      "action": "reply|call|none"
    }
  ]
}`;
}

interface ClaudeMessageResponse {
  items: Array<{
    id: number;
    category: "urgent" | "needs_reply" | "fyi" | "personal";
    summary: string;
    action: string;
  }>;
}

async function invokeClaudeForMessages(
  messages: Message[]
): Promise<ClaudeMessageResponse> {
  const prompt = buildMessageDigestPrompt(messages);

  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--model",
      "haiku",
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
        console.error("Failed to parse Claude response for messages:", stdout);
        resolve({ items: [] });
      }
    });

    claude.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
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

  // Fetch messages if enabled (default: true)
  let messagesData: DailyDigest["messages"] | undefined;
  if (options.includeMessages !== false) {
    console.log("Fetching recent messages...");
    try {
      const [unreadMessages, todaysMessages] = await Promise.all([
        messagesClient.getUnreadMessages(),
        messagesClient.getTodaysMessages(),
      ]);

      // Filter to just incoming messages (not from me)
      const incomingUnread = unreadMessages.filter((m) => !m.isFromMe);
      const incomingToday = todaysMessages.filter((m) => !m.isFromMe);

      console.log(`Found ${incomingUnread.length} unread, ${incomingToday.length} incoming today`);

      // Analyze messages with Claude if we have any
      const messagesToAnalyze = [...new Map(
        [...incomingUnread, ...incomingToday.slice(0, 20)]
          .map((m) => [m.id, m])
      ).values()].slice(0, 30);

      if (messagesToAnalyze.length > 0) {
        console.log(`Analyzing ${messagesToAnalyze.length} messages...`);
        const analysis = await invokeClaudeForMessages(messagesToAnalyze);

        const messageDigestItems: MessageDigestItem[] = analysis.items.map((item) => {
          const msg = messagesToAnalyze.find((m) => m.id === item.id);
          return {
            id: item.id,
            from: msg?.handleId || "Unknown",
            text: msg?.text.substring(0, 200) || "",
            summary: item.summary,
            category: item.category,
            action: item.action !== "none" ? item.action : undefined,
            date: msg?.date.toISOString() || new Date().toISOString(),
          };
        });

        const urgentMessages = messageDigestItems.filter((m) => m.category === "urgent");
        const needsReply = messageDigestItems.filter((m) => m.category === "needs_reply");
        const recentMessages = messageDigestItems.filter(
          (m) => m.category === "fyi" || m.category === "personal"
        ).slice(0, 5);

        messagesData = {
          unreadCount: incomingUnread.length,
          urgentMessages,
          needsReply,
          recentMessages,
        };
      } else {
        messagesData = {
          unreadCount: 0,
          urgentMessages: [],
          needsReply: [],
          recentMessages: [],
        };
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err instanceof Error ? err.message : err);
    }
  }

  if (emails.length === 0) {
    return createEmptyDigest(todayEvents, tomorrowEvents, messagesData);
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
    messages: messagesData,
  };

  return digest;
}

function createEmptyDigest(
  todayEvents: Awaited<ReturnType<typeof getTodayEvents>> = [],
  tomorrowEvents: Awaited<ReturnType<typeof getTomorrowEvents>> = [],
  messagesData?: DailyDigest["messages"]
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
    messages: messagesData,
  };
}
