// Flight tracker command: check prices and send daily email report

import {
  createWatch,
  checkPrices,
  getActiveWatches,
  getPriceHistory,
  sendDailyReport,
  logAlert,
  buildEmailBody,
} from "../flights/index.js";
import { closeDb } from "../storage/index.js";

// Jasmine's London trip configuration
const LONDON_TRIP = {
  origin: "SDF",
  destination: "LHR",
  departDate: "2026-06-30",
  returnDate: "2026-08-08",
  cabinClass: "BUSINESS",
  passengers: 1,
  notifyEmails: ["jasmine.s.watkins@gmail.com", "jermainewatkins@gmail.com"],
  notes: "Jasmine's London trip - nice seat preferred (business/premium economy)",
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "check";

  try {
    switch (command) {
      case "check": {
        // Create or get the watch
        const watch = createWatch({
          origin: LONDON_TRIP.origin,
          destination: LONDON_TRIP.destination,
          departDate: LONDON_TRIP.departDate,
          returnDate: LONDON_TRIP.returnDate,
          cabinClass: LONDON_TRIP.cabinClass,
          passengers: LONDON_TRIP.passengers,
          notifyEmails: LONDON_TRIP.notifyEmails,
          notes: LONDON_TRIP.notes,
        });

        console.log("Flight Watch Active");
        console.log(`  ${watch.origin} -> ${watch.destination}`);
        console.log(`  ${watch.depart_date} to ${watch.return_date}`);
        console.log(`  Notifying: ${watch.notify_emails}\n`);

        // Check prices
        const report = await checkPrices(watch);

        // Send email
        sendDailyReport(report);
        logAlert(watch.id, "daily_report", report.recommendation, report.bestDeal?.price);

        console.log("\nDone!");
        break;
      }

      case "preview": {
        // Preview without sending email
        const watch = createWatch({
          origin: LONDON_TRIP.origin,
          destination: LONDON_TRIP.destination,
          departDate: LONDON_TRIP.departDate,
          returnDate: LONDON_TRIP.returnDate,
          cabinClass: LONDON_TRIP.cabinClass,
          passengers: LONDON_TRIP.passengers,
          notifyEmails: LONDON_TRIP.notifyEmails,
          notes: LONDON_TRIP.notes,
        });

        const report = await checkPrices(watch);
        const body = buildEmailBody(report);
        console.log("\n" + body);
        break;
      }

      case "history": {
        // Show price history
        const watches = getActiveWatches();
        if (watches.length === 0) {
          console.log("No active flight watches. Run 'check' first.");
          break;
        }

        for (const watch of watches) {
          console.log(`\n${watch.origin} -> ${watch.destination} (${watch.depart_date} to ${watch.return_date})`);

          for (const cabin of ["BUSINESS", "PREMIUM_ECONOMY", "ECONOMY"]) {
            const history = getPriceHistory(watch.id, cabin, 30);
            if (history.length === 0) continue;

            const prices = history.map((h) => h.price);
            const low = Math.min(...prices);
            const high = Math.max(...prices);
            const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

            console.log(`\n  ${cabin}:`);
            console.log(`    Records: ${history.length} | Low: $${low} | High: $${high} | Avg: $${avg}`);

            // Show last 7 days of best prices
            const dailyBests = new Map<string, number>();
            for (const record of history) {
              const day = record.checked_at.split("T")[0];
              const current = dailyBests.get(day);
              if (!current || record.price < current) {
                dailyBests.set(day, record.price);
              }
            }

            console.log("    Recent:");
            const sortedDays = [...dailyBests.entries()].sort().slice(-7);
            for (const [day, price] of sortedDays) {
              const bar = "=".repeat(Math.round((price / high) * 30));
              console.log(`      ${day}  $${price}  ${bar}`);
            }
          }
        }
        break;
      }

      case "status": {
        const watches = getActiveWatches();
        if (watches.length === 0) {
          console.log("No active flight watches.");
        } else {
          for (const watch of watches) {
            console.log(`Watch: ${watch.id}`);
            console.log(`  Route: ${watch.origin} -> ${watch.destination}`);
            console.log(`  Dates: ${watch.depart_date} to ${watch.return_date}`);
            console.log(`  Class: ${watch.cabin_class}`);
            console.log(`  Notify: ${watch.notify_emails}`);
            console.log(`  Active: ${watch.active ? "Yes" : "No"}`);
            console.log(`  Created: ${watch.created_at}`);
          }
        }
        break;
      }

      default:
        console.log("Usage: npm run flights [check|preview|history|status]");
        console.log("  check   - Check prices and send email report (default)");
        console.log("  preview - Check prices and print report (no email)");
        console.log("  history - Show price tracking history");
        console.log("  status  - Show active flight watches");
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Flight tracker failed:", err.message);
  closeDb();
  process.exit(1);
});
