// Flight price tracker - stores prices, analyzes trends, recommends actions

import { getDb } from "../storage/db.js";
import { searchAllCabins, type FlightOffer } from "./amadeus.js";

export interface FlightWatch {
  id: string;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string;
  cabin_class: string;
  passengers: number;
  notify_emails: string;
  active: number;
  created_at: string;
  notes: string | null;
}

export interface PriceRecord {
  id: number;
  watch_id: string;
  checked_at: string;
  airline: string | null;
  price: number;
  currency: string;
  cabin_class: string;
  stops: number;
  duration_minutes: number | null;
  outbound_departure: string | null;
  outbound_arrival: string | null;
  return_departure: string | null;
  return_arrival: string | null;
}

export interface PriceTrend {
  cabin: string;
  currentBest: number;
  previousBest: number | null;
  allTimeLow: number;
  allTimeHigh: number;
  avgPrice: number;
  direction: "down" | "up" | "stable" | "new";
  changePercent: number;
  daysTracked: number;
  recommendation: string;
}

export interface DailyReport {
  watch: FlightWatch;
  checkedAt: string;
  results: {
    business: FlightOffer[];
    premiumEconomy: FlightOffer[];
    economy: FlightOffer[];
  };
  trends: PriceTrend[];
  bestDeal: FlightOffer | null;
  recommendation: string;
}

/**
 * Create or get a flight watch.
 */
export function createWatch(params: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  cabinClass?: string;
  passengers?: number;
  notifyEmails: string[];
  notes?: string;
}): FlightWatch {
  const db = getDb();
  const id = `${params.origin}-${params.destination}-${params.departDate}`;

  const existing = db
    .prepare("SELECT * FROM flight_watches WHERE id = ?")
    .get(id) as FlightWatch | undefined;

  if (existing) return existing;

  db.prepare(`
    INSERT INTO flight_watches (id, origin, destination, depart_date, return_date,
      cabin_class, passengers, notify_emails, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.origin,
    params.destination,
    params.departDate,
    params.returnDate,
    params.cabinClass || "BUSINESS",
    params.passengers || 1,
    params.notifyEmails.join(","),
    params.notes || null,
  );

  return db.prepare("SELECT * FROM flight_watches WHERE id = ?").get(id) as FlightWatch;
}

/**
 * Store flight price results in the database.
 */
export function storePrices(watchId: string, offers: FlightOffer[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO flight_prices (watch_id, airline, price, currency, cabin_class,
      stops, duration_minutes, outbound_departure, outbound_arrival,
      return_departure, return_arrival, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const offer of offers) {
    stmt.run(
      watchId,
      `${offer.airline} (${offer.airlineName})`,
      offer.price,
      offer.currency,
      offer.cabinClass,
      offer.stops,
      offer.totalDurationMinutes || null,
      offer.outbound.departure || null,
      offer.outbound.arrival || null,
      offer.return.departure || null,
      offer.return.arrival || null,
      JSON.stringify(offer.raw),
    );
  }
}

/**
 * Analyze price trends for a watch.
 */
export function analyzeTrends(watchId: string): PriceTrend[] {
  const db = getDb();
  const cabins = ["BUSINESS", "PREMIUM_ECONOMY", "ECONOMY"];
  const trends: PriceTrend[] = [];

  for (const cabin of cabins) {
    // Get today's best price
    const todayBest = db.prepare(`
      SELECT MIN(price) as price FROM flight_prices
      WHERE watch_id = ? AND cabin_class = ?
      AND date(checked_at) = date('now')
    `).get(watchId, cabin) as { price: number | null } | undefined;

    if (!todayBest?.price) continue;

    // Get yesterday's best price
    const yesterdayBest = db.prepare(`
      SELECT MIN(price) as price FROM flight_prices
      WHERE watch_id = ? AND cabin_class = ?
      AND date(checked_at) = date('now', '-1 day')
    `).get(watchId, cabin) as { price: number | null } | undefined;

    // Get all-time stats
    const stats = db.prepare(`
      SELECT MIN(price) as low, MAX(price) as high, AVG(price) as avg,
        COUNT(DISTINCT date(checked_at)) as days
      FROM flight_prices
      WHERE watch_id = ? AND cabin_class = ?
    `).get(watchId, cabin) as { low: number; high: number; avg: number; days: number };

    const currentBest = todayBest.price;
    const previousBest = yesterdayBest?.price || null;

    let direction: PriceTrend["direction"] = "new";
    let changePercent = 0;

    if (previousBest !== null) {
      changePercent = ((currentBest - previousBest) / previousBest) * 100;
      if (changePercent < -2) direction = "down";
      else if (changePercent > 2) direction = "up";
      else direction = "stable";
    }

    // Generate recommendation
    let recommendation: string;
    if (currentBest <= stats.low * 1.02) {
      recommendation = "BEST PRICE SEEN - Consider booking now!";
    } else if (currentBest <= stats.avg * 0.9) {
      recommendation = "Below average - Good time to book";
    } else if (direction === "down") {
      recommendation = "Price dropping - Monitor for another day or two";
    } else if (direction === "up" && currentBest > stats.avg) {
      recommendation = "Price rising above average - May want to act soon";
    } else {
      recommendation = "Average pricing - Continue monitoring";
    }

    trends.push({
      cabin,
      currentBest,
      previousBest,
      allTimeLow: stats.low,
      allTimeHigh: stats.high,
      avgPrice: Math.round(stats.avg),
      direction,
      changePercent: Math.round(changePercent * 10) / 10,
      daysTracked: stats.days,
      recommendation,
    });
  }

  return trends;
}

/**
 * Find the best deal across all cabin classes.
 */
function findBestDeal(results: {
  business: FlightOffer[];
  premiumEconomy: FlightOffer[];
  economy: FlightOffer[];
}): FlightOffer | null {
  // For "nice seat" preference, prioritize business > premium economy > economy
  // but also consider value
  const bestBusiness = results.business[0];
  const bestPremium = results.premiumEconomy[0];
  const bestEconomy = results.economy[0];

  // If business is available, recommend it (user wants a nice seat)
  if (bestBusiness) return bestBusiness;
  if (bestPremium) return bestPremium;
  return bestEconomy || null;
}

/**
 * Run a full price check for a watch.
 */
export async function checkPrices(watch: FlightWatch): Promise<DailyReport> {
  console.log(`Checking flights: ${watch.origin} -> ${watch.destination}`);
  console.log(`  Dates: ${watch.depart_date} to ${watch.return_date}`);

  const results = await searchAllCabins({
    origin: watch.origin,
    destination: watch.destination,
    departDate: watch.depart_date,
    returnDate: watch.return_date,
    passengers: watch.passengers,
  });

  console.log(`  Business class: ${results.business.length} offers`);
  console.log(`  Premium economy: ${results.premiumEconomy.length} offers`);
  console.log(`  Economy: ${results.economy.length} offers`);

  // Store all prices
  const allOffers = [
    ...results.business,
    ...results.premiumEconomy,
    ...results.economy,
  ];
  storePrices(watch.id, allOffers);

  // Analyze trends
  const trends = analyzeTrends(watch.id);

  // Find best deal
  const bestDeal = findBestDeal(results);

  // Overall recommendation
  const businessTrend = trends.find((t) => t.cabin === "BUSINESS");
  const recommendation = businessTrend?.recommendation ||
    trends[0]?.recommendation ||
    "No price data available yet - will have trend data after a few days of tracking.";

  return {
    watch,
    checkedAt: new Date().toISOString(),
    results,
    trends,
    bestDeal,
    recommendation,
  };
}

/**
 * Get all active watches.
 */
export function getActiveWatches(): FlightWatch[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM flight_watches WHERE active = 1")
    .all() as FlightWatch[];
}

/**
 * Log that an alert was sent.
 */
export function logAlert(watchId: string, type: string, message: string, price?: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO flight_alerts (watch_id, alert_type, message, price)
    VALUES (?, ?, ?, ?)
  `).run(watchId, type, message, price || null);
}

/**
 * Get price history for a watch.
 */
export function getPriceHistory(watchId: string, cabin?: string, days?: number): PriceRecord[] {
  const db = getDb();
  let query = "SELECT * FROM flight_prices WHERE watch_id = ?";
  const params: any[] = [watchId];

  if (cabin) {
    query += " AND cabin_class = ?";
    params.push(cabin);
  }
  if (days) {
    query += ` AND checked_at >= datetime('now', '-${days} days')`;
  }

  query += " ORDER BY checked_at DESC";
  return db.prepare(query).all(...params) as PriceRecord[];
}
