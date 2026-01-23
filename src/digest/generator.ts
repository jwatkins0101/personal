import type { EmailMessage } from "../mail/types.js";
import type { DailyDigest, DigestItem, DigestOptions, MessageDigestItem } from "./types.js";
import {
  getTodayEvents,
  getTomorrowEvents,
  formatEventTime,
} from "../calendar/apple.js";
import { messagesClient, type Message } from "../messages/index.js";
import {
  classifyItems,
  emailsToClassifiable,
  messagesToClassifiable,
  type ClassificationResult,
} from "../classifier/index.js";

// Map unified categories to digest categories
const CATEGORY_TO_DIGEST: Record<string, string> = {
  urgent: "urgent",
  work: "action_soon",
  personal: "info",
  newsletter: "low_priority",
  finance: "action_soon",
  health: "urgent",
  admin: "info",
  idea: "info",
  "waiting-on": "waiting",
  reference: "low_priority",
};

// Map unified categories to roles
const CATEGORY_TO_ROLE: Record<string, string | undefined> = {
  work: "startups",
  personal: "personal",
};

// Map unified categories to message digest categories
const CATEGORY_TO_MESSAGE: Record<string, string> = {
  urgent: "urgent",
  work: "needs_reply",
  personal: "personal",
  "waiting-on": "needs_reply",
  health: "urgent",
  finance: "needs_reply",
  admin: "fyi",
  newsletter: "fyi",
  idea: "fyi",
  reference: "fyi",
};

function classificationToDigestItem(
  result: ClassificationResult,
  email: EmailMessage
): DigestItem {
  const digestCategory = CATEGORY_TO_DIGEST[result.category] || "info";
  const role = CATEGORY_TO_ROLE[result.category];

  return {
    id: result.id,
    from: email.from,
    subject: email.subject,
    summary: result.reason,
    action: result.suggested_next_action !== "Review manually"
      ? result.suggested_next_action
      : undefined,
    owner: result.priority === "P0" || result.priority === "P1" ? "me" : "other",
    category: digestCategory as DigestItem["category"],
    role: role as DigestItem["role"],
    originalDate: email.date,
    // Extended fields
    priority: result.priority,
    confidence: result.confidence,
  };
}

function classificationToMessageItem(
  result: ClassificationResult,
  message: Message
): MessageDigestItem {
  const msgCategory = CATEGORY_TO_MESSAGE[result.category] || "fyi";

  return {
    id: parseInt(result.id),
    from: message.handleId,
    text: message.text.substring(0, 200),
    summary: result.reason,
    category: msgCategory as MessageDigestItem["category"],
    action: result.suggested_next_action !== "Review manually"
      ? result.suggested_next_action
      : undefined,
    date: message.date.toISOString(),
    // Extended fields
    priority: result.priority,
    confidence: result.confidence,
  };
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

  // Fetch and classify messages if enabled (default: true)
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

      // Dedupe and limit messages to analyze
      const messagesToAnalyze = [...new Map(
        [...incomingUnread, ...incomingToday.slice(0, 20)]
          .map((m) => [m.id, m])
      ).values()].slice(0, 30);

      if (messagesToAnalyze.length > 0) {
        console.log(`Classifying ${messagesToAnalyze.length} messages...`);

        // Use unified classifier
        const classifiableMessages = messagesToClassifiable(messagesToAnalyze);
        const classifications = await classifyItems(classifiableMessages);

        const messageDigestItems: MessageDigestItem[] = classifications.map((result) => {
          const msg = messagesToAnalyze.find((m) => String(m.id) === result.id);
          return classificationToMessageItem(result, msg!);
        });

        const urgentMessages = messageDigestItems.filter(
          (m) => m.category === "urgent" || m.priority === "P0"
        );
        const needsReply = messageDigestItems.filter(
          (m) => m.category === "needs_reply" || m.priority === "P1"
        );
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

  console.log(`Classifying ${emails.length} emails...`);

  // Use unified classifier for emails
  const classifiableEmails = emailsToClassifiable(emails);
  const classifications = await classifyItems(classifiableEmails);

  // Build digest items
  const digestItems: DigestItem[] = classifications.map((result) => {
    const email = emails.find((e) => e.id === result.id);
    return classificationToDigestItem(result, email!);
  });

  // Organize into sections based on priority and category
  const urgent = digestItems.filter(
    (i) => i.category === "urgent" || i.priority === "P0"
  );
  const actionSoon = digestItems.filter(
    (i) => i.category === "action_soon" || i.priority === "P1"
  );
  const waiting = digestItems.filter((i) => i.category === "waiting");
  const info = digestItems.filter((i) => i.category === "info");
  const lowPriority = digestItems.filter((i) => i.category === "low_priority");

  // Organize by role (inferred from category keywords in content)
  const university = digestItems.filter((i) =>
    i.role === "university" ||
    /\b(edu|class|course|professor|student|campus|academic)\b/i.test(i.subject + " " + i.from)
  );
  const startups = digestItems.filter((i) =>
    i.role === "startups" ||
    /\b(investor|funding|startup|venture|founder|pitch)\b/i.test(i.subject + " " + i.summary)
  );
  const personal = digestItems.filter((i) => i.role === "personal");

  // Generate today's focus based on classifications
  const todaysFocus = generateTodaysFocus(urgent, actionSoon, digestItems);

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
      todaysFocus,
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

function generateTodaysFocus(
  urgent: DigestItem[],
  actionSoon: DigestItem[],
  all: DigestItem[]
): string {
  if (urgent.length > 0) {
    const topUrgent = urgent[0];
    return `Priority: ${topUrgent.subject} - ${topUrgent.action || "Review immediately"}`;
  }

  if (actionSoon.length > 0) {
    return `${actionSoon.length} item(s) need attention today. Start with: ${actionSoon[0].subject}`;
  }

  if (all.length === 0) {
    return "No new emails to process. Enjoy your clear inbox!";
  }

  return `${all.length} emails processed. No urgent items - focus on your planned work.`;
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
