import type { DailyDigest, DigestItem } from "./types.js";

function formatItem(item: DigestItem, includeAction = true): string {
  let line = `• **${item.from}**: ${item.subject}`;
  line += `\n  _${item.summary}_`;

  if (includeAction && item.action) {
    line += `\n  → Action: **${item.action.toUpperCase()}**`;
    if (item.dueDate) {
      line += ` (Due: ${item.dueDate})`;
    }
  }

  return line;
}

function formatItemConsole(item: DigestItem, includeAction = true): string {
  let line = `  • [${item.from}] ${item.subject}`;
  line += `\n    ${item.summary}`;

  if (includeAction && item.action) {
    line += `\n    → ${item.action.toUpperCase()}`;
    if (item.dueDate) {
      line += ` (Due: ${item.dueDate})`;
    }
  }

  return line;
}

export function formatDigestMarkdown(digest: DailyDigest): string {
  const lines: string[] = [];

  // Header
  lines.push(`# 📬 Daily Email Digest`);
  lines.push(`**${digest.date}**\n`);

  // Today's Focus
  lines.push(`## 🎯 Today's Focus`);
  lines.push(`> ${digest.overview.todaysFocus}\n`);

  // Overview Stats
  lines.push(`## 📊 Overview`);
  lines.push(`| Category | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Total Emails | ${digest.overview.totalEmails} |`);
  lines.push(`| 🔴 Urgent | ${digest.overview.urgentCount} |`);
  lines.push(`| 🟡 Action Soon | ${digest.overview.actionCount} |`);
  lines.push(`| ⏳ Waiting on Others | ${digest.overview.waitingCount} |`);
  lines.push(`| ℹ️ FYI/Info | ${digest.overview.infoCount} |`);
  lines.push(`| 📅 Today's Meetings | ${digest.todayMeetings.length} |`);
  lines.push(``);

  // Today's Meetings
  if (digest.todayMeetings.length > 0) {
    lines.push(`## 📅 Today's Meetings (${digest.todayMeetings.length})`);
    digest.todayMeetings.forEach((meeting) => {
      let line = `• **${meeting.time}** - ${meeting.title}`;
      if (meeting.location) {
        line += ` 📍 _${meeting.location}_`;
      }
      lines.push(line);
    });
    lines.push(``);
  }

  // Tomorrow's Meetings
  if (digest.tomorrowMeetings.length > 0) {
    lines.push(`## 📆 Tomorrow's Meetings (${digest.tomorrowMeetings.length})`);
    digest.tomorrowMeetings.forEach((meeting) => {
      let line = `• **${meeting.time}** - ${meeting.title}`;
      if (meeting.location) {
        line += ` 📍 _${meeting.location}_`;
      }
      lines.push(line);
    });
    lines.push(``);
  }

  // Urgent Section
  if (digest.urgent.length > 0) {
    lines.push(`## 🔴 Urgent Today (${digest.urgent.length})`);
    lines.push(`_Requires action today_\n`);
    digest.urgent.forEach((item) => {
      lines.push(formatItem(item));
      lines.push(``);
    });
  }

  // Action Soon Section
  if (digest.actionSoon.length > 0) {
    lines.push(`## 🟡 Action Soon (${digest.actionSoon.length})`);
    lines.push(`_Needs attention this week_\n`);
    digest.actionSoon.forEach((item) => {
      lines.push(formatItem(item));
      lines.push(``);
    });
  }

  // Waiting on Others
  if (digest.waitingOnOthers.length > 0) {
    lines.push(`## ⏳ Waiting on Others (${digest.waitingOnOthers.length})`);
    lines.push(`_Pending responses - consider following up_\n`);
    digest.waitingOnOthers.forEach((item) => {
      lines.push(formatItem(item, false));
      lines.push(``);
    });
  }

  // By Role Sections
  if (digest.byRole.university.length > 0) {
    lines.push(`## 🎓 University (${digest.byRole.university.length})`);
    digest.byRole.university.forEach((item) => {
      lines.push(formatItem(item));
      lines.push(``);
    });
  }

  if (digest.byRole.startups.length > 0) {
    lines.push(`## 🚀 Startups & Business (${digest.byRole.startups.length})`);
    digest.byRole.startups.forEach((item) => {
      lines.push(formatItem(item));
      lines.push(``);
    });
  }

  if (digest.byRole.personal.length > 0) {
    lines.push(`## 👤 Personal (${digest.byRole.personal.length})`);
    digest.byRole.personal.forEach((item) => {
      lines.push(formatItem(item));
      lines.push(``);
    });
  }

  // FYI Section
  if (digest.fyi.length > 0) {
    lines.push(`## 📄 FYI / Low Priority (${digest.fyi.length})`);
    lines.push(`_Read later or archive_\n`);
    digest.fyi.forEach((item) => {
      lines.push(`• **${item.from}**: ${item.subject}`);
    });
    lines.push(``);
  }

  // Footer
  lines.push(`---`);
  lines.push(`_Generated at ${new Date(digest.generatedAt).toLocaleTimeString()}_`);

  return lines.join("\n");
}

export function formatDigestConsole(digest: DailyDigest): string {
  const lines: string[] = [];
  const divider = "═".repeat(60);
  const subDivider = "─".repeat(60);

  // Header
  lines.push(divider);
  lines.push(`  📬 DAILY EMAIL DIGEST`);
  lines.push(`  ${digest.date}`);
  lines.push(divider);

  // Today's Focus
  lines.push(`\n🎯 TODAY'S FOCUS`);
  lines.push(subDivider);
  lines.push(`  ${digest.overview.todaysFocus}`);

  // Overview Stats
  lines.push(`\n📊 OVERVIEW`);
  lines.push(subDivider);
  lines.push(`  Total: ${digest.overview.totalEmails} emails`);
  lines.push(`  🔴 Urgent: ${digest.overview.urgentCount}`);
  lines.push(`  🟡 Action Soon: ${digest.overview.actionCount}`);
  lines.push(`  ⏳ Waiting: ${digest.overview.waitingCount}`);
  lines.push(`  ℹ️  FYI: ${digest.overview.infoCount}`);
  lines.push(`  📅 Meetings today: ${digest.todayMeetings.length}`);

  // Today's Meetings
  if (digest.todayMeetings.length > 0) {
    lines.push(`\n📅 TODAY'S MEETINGS (${digest.todayMeetings.length})`);
    lines.push(subDivider);
    digest.todayMeetings.forEach((meeting) => {
      let line = `  • ${meeting.time} - ${meeting.title}`;
      if (meeting.location) {
        line += `\n    📍 ${meeting.location}`;
      }
      lines.push(line);
    });
  }

  // Tomorrow's Meetings
  if (digest.tomorrowMeetings.length > 0) {
    lines.push(`\n📆 TOMORROW'S MEETINGS (${digest.tomorrowMeetings.length})`);
    lines.push(subDivider);
    digest.tomorrowMeetings.forEach((meeting) => {
      let line = `  • ${meeting.time} - ${meeting.title}`;
      if (meeting.location) {
        line += `\n    📍 ${meeting.location}`;
      }
      lines.push(line);
    });
  }

  // Urgent Section
  if (digest.urgent.length > 0) {
    lines.push(`\n🔴 URGENT TODAY (${digest.urgent.length})`);
    lines.push(subDivider);
    digest.urgent.forEach((item) => {
      lines.push(formatItemConsole(item));
    });
  }

  // Action Soon Section
  if (digest.actionSoon.length > 0) {
    lines.push(`\n🟡 ACTION SOON (${digest.actionSoon.length})`);
    lines.push(subDivider);
    digest.actionSoon.forEach((item) => {
      lines.push(formatItemConsole(item));
    });
  }

  // Waiting on Others
  if (digest.waitingOnOthers.length > 0) {
    lines.push(`\n⏳ WAITING ON OTHERS (${digest.waitingOnOthers.length})`);
    lines.push(subDivider);
    digest.waitingOnOthers.forEach((item) => {
      lines.push(formatItemConsole(item, false));
    });
  }

  // By Role Sections
  if (digest.byRole.university.length > 0) {
    lines.push(`\n🎓 UNIVERSITY (${digest.byRole.university.length})`);
    lines.push(subDivider);
    digest.byRole.university.forEach((item) => {
      lines.push(formatItemConsole(item));
    });
  }

  if (digest.byRole.startups.length > 0) {
    lines.push(`\n🚀 STARTUPS & BUSINESS (${digest.byRole.startups.length})`);
    lines.push(subDivider);
    digest.byRole.startups.forEach((item) => {
      lines.push(formatItemConsole(item));
    });
  }

  if (digest.byRole.personal.length > 0) {
    lines.push(`\n👤 PERSONAL (${digest.byRole.personal.length})`);
    lines.push(subDivider);
    digest.byRole.personal.forEach((item) => {
      lines.push(formatItemConsole(item));
    });
  }

  // FYI Section
  if (digest.fyi.length > 0) {
    lines.push(`\n📄 FYI / LOW PRIORITY (${digest.fyi.length})`);
    lines.push(subDivider);
    digest.fyi.forEach((item) => {
      lines.push(`  • [${item.from}] ${item.subject}`);
    });
  }

  // Footer
  lines.push(`\n${divider}`);
  lines.push(`  Generated at ${new Date(digest.generatedAt).toLocaleTimeString()}`);
  lines.push(divider);

  return lines.join("\n");
}

export function formatDigestHtml(digest: DailyDigest): string {
  const itemToHtml = (item: DigestItem, showAction = true): string => {
    let html = `<div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px;">`;
    html += `<strong>${escapeHtml(item.from)}</strong>: ${escapeHtml(item.subject)}<br>`;
    html += `<em style="color: #666;">${escapeHtml(item.summary)}</em>`;
    if (showAction && item.action) {
      html += `<br><span style="color: #d63384;">→ ${item.action.toUpperCase()}</span>`;
      if (item.dueDate) {
        html += ` <span style="color: #666;">(Due: ${escapeHtml(item.dueDate)})</span>`;
      }
    }
    html += `</div>`;
    return html;
  };

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Email Digest - ${escapeHtml(digest.date)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #495057; margin-top: 24px; }
    .focus { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 16px 0; }
    .stat { background: #e9ecef; padding: 12px; border-radius: 6px; text-align: center; }
    .stat-number { font-size: 24px; font-weight: bold; }
    .urgent { border-left: 4px solid #dc3545; }
    .action { border-left: 4px solid #ffc107; }
    .waiting { border-left: 4px solid #17a2b8; }
    .meeting { background: #e3f2fd; padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #2196f3; }
    .meeting-time { font-weight: bold; color: #1565c0; }
    .meeting-location { color: #666; font-size: 0.9em; }
    .fyi-item { padding: 6px 0; border-bottom: 1px solid #eee; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📬 Daily Email Digest</h1>
  <p><strong>${escapeHtml(digest.date)}</strong></p>

  <div class="focus">
    <strong>🎯 Today's Focus:</strong><br>
    ${escapeHtml(digest.overview.todaysFocus)}
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-number">${digest.overview.totalEmails}</div>Total</div>
    <div class="stat"><div class="stat-number" style="color:#dc3545">${digest.overview.urgentCount}</div>Urgent</div>
    <div class="stat"><div class="stat-number" style="color:#ffc107">${digest.overview.actionCount}</div>Action</div>
    <div class="stat"><div class="stat-number" style="color:#17a2b8">${digest.overview.waitingCount}</div>Waiting</div>
    <div class="stat"><div class="stat-number" style="color:#2196f3">${digest.todayMeetings.length}</div>Meetings</div>
  </div>`;

  // Today's Meetings
  if (digest.todayMeetings.length > 0) {
    html += `<h2>📅 Today's Meetings (${digest.todayMeetings.length})</h2>`;
    digest.todayMeetings.forEach((meeting) => {
      html += `<div class="meeting">`;
      html += `<span class="meeting-time">${escapeHtml(meeting.time)}</span> - ${escapeHtml(meeting.title)}`;
      if (meeting.location) {
        html += `<br><span class="meeting-location">📍 ${escapeHtml(meeting.location)}</span>`;
      }
      html += `</div>`;
    });
  }

  // Tomorrow's Meetings
  if (digest.tomorrowMeetings.length > 0) {
    html += `<h2>📆 Tomorrow's Meetings (${digest.tomorrowMeetings.length})</h2>`;
    digest.tomorrowMeetings.forEach((meeting) => {
      html += `<div class="meeting" style="background: #f5f5f5; border-left-color: #9e9e9e;">`;
      html += `<span class="meeting-time" style="color: #616161;">${escapeHtml(meeting.time)}</span> - ${escapeHtml(meeting.title)}`;
      if (meeting.location) {
        html += `<br><span class="meeting-location">📍 ${escapeHtml(meeting.location)}</span>`;
      }
      html += `</div>`;
    });
  }

  if (digest.urgent.length > 0) {
    html += `<h2>🔴 Urgent Today (${digest.urgent.length})</h2>`;
    digest.urgent.forEach((item) => {
      html += `<div class="urgent">${itemToHtml(item)}</div>`;
    });
  }

  if (digest.actionSoon.length > 0) {
    html += `<h2>🟡 Action Soon (${digest.actionSoon.length})</h2>`;
    digest.actionSoon.forEach((item) => {
      html += `<div class="action">${itemToHtml(item)}</div>`;
    });
  }

  if (digest.waitingOnOthers.length > 0) {
    html += `<h2>⏳ Waiting on Others (${digest.waitingOnOthers.length})</h2>`;
    digest.waitingOnOthers.forEach((item) => {
      html += `<div class="waiting">${itemToHtml(item, false)}</div>`;
    });
  }

  if (digest.byRole.university.length > 0) {
    html += `<h2>🎓 University (${digest.byRole.university.length})</h2>`;
    digest.byRole.university.forEach((item) => {
      html += itemToHtml(item);
    });
  }

  if (digest.byRole.startups.length > 0) {
    html += `<h2>🚀 Startups & Business (${digest.byRole.startups.length})</h2>`;
    digest.byRole.startups.forEach((item) => {
      html += itemToHtml(item);
    });
  }

  if (digest.byRole.personal.length > 0) {
    html += `<h2>👤 Personal (${digest.byRole.personal.length})</h2>`;
    digest.byRole.personal.forEach((item) => {
      html += itemToHtml(item);
    });
  }

  if (digest.fyi.length > 0) {
    html += `<h2>📄 FYI / Low Priority (${digest.fyi.length})</h2>`;
    digest.fyi.forEach((item) => {
      html += `<div class="fyi-item"><strong>${escapeHtml(item.from)}</strong>: ${escapeHtml(item.subject)}</div>`;
    });
  }

  html += `
  <div class="footer">
    Generated at ${new Date(digest.generatedAt).toLocaleTimeString()}
  </div>
</body>
</html>`;

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
