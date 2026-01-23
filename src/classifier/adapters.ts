import type { ClassifiableItem } from "./types.js";
import type { EmailMessage } from "../mail/types.js";
import type { Message } from "../messages/types.js";

/**
 * Convert an email to a classifiable item
 */
export function emailToClassifiable(email: EmailMessage): ClassifiableItem {
  return {
    id: email.id,
    type: "email",
    from: email.from,
    to: email.to || undefined,
    subject: email.subject,
    content: email.snippet,
    date: email.date,
    metadata: {
      account: email.account,
      labels: email.labels,
      threadId: email.threadId,
    },
  };
}

/**
 * Convert multiple emails to classifiable items
 */
export function emailsToClassifiable(emails: EmailMessage[]): ClassifiableItem[] {
  return emails.map(emailToClassifiable);
}

/**
 * Convert a message to a classifiable item
 */
export function messageToClassifiable(message: Message): ClassifiableItem {
  return {
    id: String(message.id),
    type: "message",
    from: message.isFromMe ? "me" : message.handleId,
    to: message.isFromMe ? message.handleId : "me",
    content: message.text,
    date: message.date.toISOString(),
    metadata: {
      isFromMe: message.isFromMe,
      isRead: message.isRead,
      hasAttachments: message.hasAttachments,
      chatId: message.chatId,
      isReply: !!message.threadOriginatorGuid,
    },
  };
}

/**
 * Convert multiple messages to classifiable items
 */
export function messagesToClassifiable(messages: Message[]): ClassifiableItem[] {
  return messages.map(messageToClassifiable);
}

/**
 * Note structure for future use
 */
export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  modifiedAt: string;
  folder?: string;
  tags?: string[];
}

/**
 * Convert a note to a classifiable item
 */
export function noteToClassifiable(note: Note): ClassifiableItem {
  return {
    id: note.id,
    type: "note",
    subject: note.title,
    content: note.body,
    date: note.modifiedAt,
    metadata: {
      folder: note.folder,
      tags: note.tags,
      createdAt: note.createdAt,
    },
  };
}

/**
 * Convert multiple notes to classifiable items
 */
export function notesToClassifiable(notes: Note[]): ClassifiableItem[] {
  return notes.map(noteToClassifiable);
}

/**
 * Calendar event structure
 */
export interface CalendarEventInput {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  calendar?: string;
  isAllDay: boolean;
}

/**
 * Convert a calendar event to a classifiable item
 */
export function calendarEventToClassifiable(
  event: CalendarEventInput
): ClassifiableItem {
  const content = [
    event.description || "",
    event.location ? `Location: ${event.location}` : "",
    `Duration: ${event.startTime} - ${event.endTime}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: event.id,
    type: "calendar",
    subject: event.title,
    content: content || event.title,
    date: event.startTime,
    metadata: {
      endTime: event.endTime,
      location: event.location,
      calendar: event.calendar,
      isAllDay: event.isAllDay,
    },
  };
}

/**
 * Convert multiple calendar events to classifiable items
 */
export function calendarEventsToClassifiable(
  events: CalendarEventInput[]
): ClassifiableItem[] {
  return events.map(calendarEventToClassifiable);
}
