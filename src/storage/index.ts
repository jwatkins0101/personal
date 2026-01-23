// Public exports for storage module

// Types
export type {
  MemoryItem,
  MemoryItemRow,
  NewMemoryItem,
  ActionLog,
  ActionLogRow,
  Feedback,
  FeedbackRow,
  ItemSource,
  ItemStatus,
  BouncerDecision,
  BouncerThresholds,
} from "./types.js";

export { DEFAULT_BOUNCER_THRESHOLDS } from "./types.js";

// Database
export { getDb, closeDb, transaction } from "./db.js";

// Repository
export {
  makeItemId,
  parseItemId,
  insertItem,
  getItem,
  getItemsByStatus,
  getItemsBySource,
  getItemsByRoute,
  getUnclassifiedItems,
  getQueuedItems,
  updateClassification,
  updateStatus,
  updateRoute,
  updateStatusAndRoute,
  searchByTitle,
  searchByContent,
  getItemsInRange,
  getHighPriorityItems,
  getStatusCounts,
  deleteItem,
  updateField,
} from "./repository.js";

// Action logging
export {
  logAction,
  logSuccess,
  logFailure,
  getLogsForItem,
  getRecentLogs,
  getLogsByAction,
  getLogsInRange,
  getFailureLogs,
  getActionCounts,
  getSuccessRate,
} from "./action-log.js";

// Bouncer
export {
  getBouncerDecision,
  formatBouncerDecision,
  shouldNotify,
} from "./bouncer.js";

// Feedback
export {
  recordFeedback,
  applyCorrection,
  getFeedbackForItem,
  getRecentFeedback,
  getFeedbackStats,
  getCommonCorrections,
} from "./feedback.js";
