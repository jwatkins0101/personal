// Types for Apple Notes integration

export interface Note {
  id: string;
  title: string;
  body: string;
  folder: string;
}

export interface NoteCreateResult {
  success: boolean;
  action: "created" | "updated" | "exists" | "appended" | "error";
  noteId?: string;
  error?: string;
}

export interface NoteFolder {
  name: string;
  description: string;
}

// Standard folders for the Second Brain
export const STANDARD_FOLDERS: NoteFolder[] = [
  { name: "Inbox", description: "Items needing immediate attention" },
  { name: "Review", description: "Items queued for human review" },
  { name: "Work", description: "Work-related items" },
  { name: "Personal", description: "Personal items" },
  { name: "Finance", description: "Financial items" },
  { name: "Health", description: "Health-related items" },
  { name: "Admin", description: "Administrative items" },
  { name: "Ideas", description: "Ideas and brainstorms" },
  { name: "Waiting", description: "Items waiting on others" },
  { name: "Briefings", description: "Daily briefing notes" },
];

// Route to folder mapping
export const ROUTE_TO_FOLDER: Record<string, string> = {
  inbox: "Inbox",
  review: "Review",
  "notes:inbox": "Inbox",
  "notes:work": "Work",
  "notes:personal": "Personal",
  "notes:finance": "Finance",
  "notes:health": "Health",
  "notes:admin": "Admin",
  "notes:ideas": "Ideas",
  "notes:waiting": "Waiting",
  archive: "Archive",
};

/**
 * Get the folder name for a route.
 */
export function getFolderForRoute(route: string): string {
  return ROUTE_TO_FOLDER[route] || "Inbox";
}
