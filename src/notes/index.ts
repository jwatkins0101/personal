// Apple Notes module exports

export type { Note, NoteCreateResult, NoteFolder } from "./types.js";
export { STANDARD_FOLDERS, ROUTE_TO_FOLDER, getFolderForRoute } from "./types.js";
export {
  createNote,
  updateNote,
  upsertNote,
  duplicateNote,
  updateNoteSection,
  appendToNote,
  createDailyTasksNote,
} from "./client.js";
export {
  generateInboxView,
  generateReviewView,
  generateBriefingView,
  formatItemForNote,
} from "./views.js";
