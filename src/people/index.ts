// People module exports

export type {
  Person,
  PersonRow,
  PersonIdentity,
  PersonIdentityRow,
  ItemPersonMap,
  LinkedInConnection,
  LinkedInMessage,
  ImportBatch,
  MatchCandidate,
  NewPerson,
  PersonWithContext,
  PersonNudge,
  IdentityType,
  IdentitySource,
  MatchCandidateStatus,
} from "./types.js";

export { MATCH_CONFIDENCE } from "./types.js";

export {
  generatePersonId,
  upsertPerson,
  getPerson,
  findPersonByLinkedInUrl,
  findPersonByEmail,
  findPersonByIdentity,
  addPersonIdentity,
  getPersonIdentities,
  linkItemToPerson,
  getPeopleForItem,
  getItemsForPerson,
  mergePeople,
  searchPeople,
  listPeople,
  listPeopleToNudge,
  getRecentConnections,
  getPeopleCount,
  getLinkedInConnectionCount,
  addMatchCandidate,
  getPendingMatchCandidates,
  resolveMatchCandidate,
  updatePersonField,
  deletePerson,
} from "./repository.js";

export type { MatchResult } from "./matcher.js";

export {
  matchByEmail,
  matchByPhone,
  matchByLinkedInUrl,
  findBestMatch,
  linkItemToMatchedPerson,
  matchOrCreatePerson,
  extractEmails,
  extractPhones,
} from "./matcher.js";
