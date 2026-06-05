// Public exports for flights module

export { searchFlights, searchAllCabins, type FlightOffer } from "./amadeus.js";
export {
  createWatch,
  checkPrices,
  getActiveWatches,
  analyzeTrends,
  getPriceHistory,
  logAlert,
  type FlightWatch,
  type DailyReport,
  type PriceTrend,
} from "./tracker.js";
export { sendDailyReport, buildEmailBody, buildEmailSubject } from "./email.js";
