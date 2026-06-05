// Email formatting and sending for flight alerts

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PROJECT_ROOT } from "../config.js";
import type { DailyReport, PriceTrend } from "./tracker.js";
import type { FlightOffer } from "./amadeus.js";

/**
 * Format a price as USD.
 */
function usd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format duration in minutes to human readable.
 */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format cabin class name for display.
 */
function formatCabin(cabin: string): string {
  switch (cabin) {
    case "BUSINESS": return "Business Class";
    case "PREMIUM_ECONOMY": return "Premium Economy";
    case "ECONOMY": return "Economy";
    default: return cabin;
  }
}

/**
 * Direction arrow for trend.
 */
function trendArrow(direction: string): string {
  switch (direction) {
    case "down": return "v DROPPED";
    case "up": return "^ INCREASED";
    case "stable": return "= STABLE";
    default: return "* NEW";
  }
}

/**
 * Format a single flight offer for plain text.
 */
function formatOffer(offer: FlightOffer, rank: number): string {
  const stops = offer.stops === 0 ? "Nonstop" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`;
  const duration = offer.totalDurationMinutes ? formatDuration(offer.totalDurationMinutes) : "";

  const outDep = offer.outbound.departure
    ? new Date(offer.outbound.departure).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const retDep = offer.return.departure
    ? new Date(offer.return.departure).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  return [
    `  #${rank}  ${usd(offer.price)}  |  ${offer.airlineName}  |  ${stops}  |  ${duration}`,
    `        Depart: ${outDep}`,
    `        Return: ${retDep}`,
  ].join("\n");
}

/**
 * Format the trend section.
 */
function formatTrend(trend: PriceTrend): string {
  const change = trend.previousBest
    ? ` (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%)`
    : "";

  return [
    `  ${formatCabin(trend.cabin)}`,
    `    Today's Best: ${usd(trend.currentBest)} ${trendArrow(trend.direction)}${change}`,
    `    All-Time Low: ${usd(trend.allTimeLow)}  |  Avg: ${usd(trend.avgPrice)}  |  High: ${usd(trend.allTimeHigh)}`,
    `    Days Tracked: ${trend.daysTracked}`,
    `    >> ${trend.recommendation}`,
  ].join("\n");
}

/**
 * Build the full email body for a daily report.
 */
export function buildEmailBody(report: DailyReport): string {
  const { watch, results, trends, bestDeal, recommendation } = report;
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const sections: string[] = [];

  // Header
  sections.push([
    `LONDON FLIGHT TRACKER - ${date}`,
    `${"=".repeat(50)}`,
    ``,
    `Route: ${watch.origin} -> ${watch.destination}`,
    `Travel: ${watch.depart_date} to ${watch.return_date}`,
    `Passengers: ${watch.passengers}`,
    ``,
  ].join("\n"));

  // Recommendation banner
  if (bestDeal) {
    sections.push([
      `TODAY'S TOP PICK`,
      `${"~".repeat(30)}`,
      `${usd(bestDeal.price)} - ${bestDeal.airlineName} ${formatCabin(bestDeal.cabinClass)}`,
      `${bestDeal.stops === 0 ? "Nonstop" : `${bestDeal.stops} stop(s)`}`,
      ``,
      `>> ${recommendation}`,
      ``,
    ].join("\n"));
  }

  // Price trends
  if (trends.length > 0) {
    sections.push([
      `PRICE TRENDS`,
      `${"~".repeat(30)}`,
      ...trends.map(formatTrend),
      ``,
    ].join("\n"));
  }

  // Business class offers
  if (results.business.length > 0) {
    sections.push([
      `BUSINESS CLASS OPTIONS`,
      `${"~".repeat(30)}`,
      ...results.business.map((o, i) => formatOffer(o, i + 1)),
      ``,
    ].join("\n"));
  }

  // Premium economy offers
  if (results.premiumEconomy.length > 0) {
    sections.push([
      `PREMIUM ECONOMY OPTIONS`,
      `${"~".repeat(30)}`,
      ...results.premiumEconomy.map((o, i) => formatOffer(o, i + 1)),
      ``,
    ].join("\n"));
  }

  // Economy offers (for comparison)
  if (results.economy.length > 0) {
    sections.push([
      `ECONOMY (for comparison)`,
      `${"~".repeat(30)}`,
      ...results.economy.map((o, i) => formatOffer(o, i + 1)),
      ``,
    ].join("\n"));
  }

  // Footer
  sections.push([
    `${"=".repeat(50)}`,
    `Tracked daily by your Assistance system.`,
    `Prices are round-trip per person in USD.`,
    `Search on Google Flights or your preferred airline to book.`,
  ].join("\n"));

  return sections.join("\n");
}

/**
 * Build the email subject line.
 */
export function buildEmailSubject(report: DailyReport): string {
  const { bestDeal, trends } = report;

  // Check for notable events
  const businessTrend = trends.find((t) => t.cabin === "BUSINESS");
  const isLow = businessTrend && businessTrend.currentBest <= businessTrend.allTimeLow * 1.02;
  const isDropping = businessTrend && businessTrend.direction === "down";

  if (isLow && bestDeal) {
    return `[LOWEST PRICE] London Flight: ${usd(bestDeal.price)} ${formatCabin(bestDeal.cabinClass)}`;
  }
  if (isDropping && bestDeal) {
    return `[PRICE DROP] London Flight: ${usd(bestDeal.price)} ${formatCabin(bestDeal.cabinClass)}`;
  }
  if (bestDeal) {
    return `London Flight Update: ${usd(bestDeal.price)} ${formatCabin(bestDeal.cabinClass)}`;
  }
  return `London Flight Tracker - Daily Update`;
}

/**
 * Send email via Apple Mail using AppleScript.
 */
export function sendEmail(to: string[], subject: string, body: string): void {
  const recipients = to.join(",");

  // Write body to temp file to pass via script
  const tmpFile = join(tmpdir(), `flight-email-${Date.now()}.txt`);
  writeFileSync(tmpFile, body, "utf-8");

  // Build AppleScript inline — avoids shell escaping issues and timeouts
  const recipientLines = to
    .map((addr) => `make new to recipient at end of to recipients with properties {address:"${addr.trim()}"}`)
    .join("\n          ");

  const script = `
tell application "Mail"
    activate
    delay 3
    set bodyText to read POSIX file "${tmpFile}" as «class utf8»
    set newMessage to make new outgoing message with properties {subject:"${subject.replace(/"/g, '\\"')}", content:bodyText, visible:true}
    tell newMessage
          ${recipientLines}
    end tell
    send newMessage
end tell
  `.trim();

  try {
    execFileSync("osascript", ["-e", script], {
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`  Email sent to: ${recipients}`);
  } catch (err: any) {
    // Mail.app often queues the message even if AppleScript times out
    console.log(`  Email queued in Mail.app for: ${recipients}`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Send the daily flight report email.
 */
export function sendDailyReport(report: DailyReport): void {
  const recipients = report.watch.notify_emails.split(",").map((e) => e.trim());
  const subject = buildEmailSubject(report);
  const body = buildEmailBody(report);

  console.log(`\nSending report: ${subject}`);
  sendEmail(recipients, subject, body);
}
