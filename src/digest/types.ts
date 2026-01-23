export interface DigestItem {
  id: string;
  from: string;
  subject: string;
  summary: string;
  action?: string;
  owner?: "me" | "other";
  dueDate?: string;
  category: "urgent" | "action_soon" | "waiting" | "info" | "low_priority";
  role?: "university" | "startups" | "personal" | "general";
  originalDate: string;
}

export interface DigestSection {
  title: string;
  items: DigestItem[];
}

export interface DailyDigest {
  date: string;
  generatedAt: string;

  // Overview stats
  overview: {
    totalEmails: number;
    urgentCount: number;
    actionCount: number;
    waitingCount: number;
    infoCount: number;
    todaysFocus: string;
  };

  // Sections
  urgent: DigestItem[];
  actionSoon: DigestItem[];
  waitingOnOthers: DigestItem[];
  byRole: {
    university: DigestItem[];
    startups: DigestItem[];
    personal: DigestItem[];
  };
  fyi: DigestItem[];

  // Calendar integration
  todayMeetings: Array<{
    title: string;
    time: string;
    location?: string;
    calendar?: string;
    isAllDay: boolean;
  }>;
  tomorrowMeetings: Array<{
    title: string;
    time: string;
    location?: string;
    calendar?: string;
    isAllDay: boolean;
  }>;
}

export interface DigestOptions {
  provider: "gmail" | "outlook" | "all";
  outputFormat: "console" | "markdown" | "html" | "email";
  outputPath?: string;
  includeCalendar?: boolean;
  roleKeywords?: {
    university: string[];
    startups: string[];
    personal: string[];
  };
}
