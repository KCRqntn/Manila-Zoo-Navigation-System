// All times are Manila time (UTC+8, no daylight saving). The older "timestamp" columns store
// wall-clock time, so the server's own time zone must not change how they're read or written,
// whether it runs on this laptop or on a cloud server set to UTC.
process.env.TZ = "Asia/Manila";

import app from "./app";
import { logger } from "./lib/logger";
import { ensureMapLayoutSchema } from "./lib/mapSchema";
import { fixSeedAnimalPhotos } from "./lib/seedPhotoFix";
import { upgradePlaceholderLayout, assignMissingAnimalLocations } from "./lib/zooLayout";
import { fixSeedVisitInfo } from "./lib/seedInfoFix";
import { ensureAnimalFeedbackSchema } from "./routes/animalFeedback";
import { ensureGamesSchema } from "./routes/games";
import { ensureQrLocationSchema } from "./routes/qr";
import { runMigrations } from "./lib/migrations";
import { seedVerifiedTicketPrices } from "./lib/seedTicketPrices";
import { warmThumbnails } from "./routes/images";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Make sure the 2.5D map tables exist before serving; a failure is logged but doesn't block
// the rest of the API (only the map endpoints depend on them).
try {
  await ensureMapLayoutSchema();
} catch (err) {
  logger.error({ err }, "Could not prepare map layout tables");
}
try {
  await ensureAnimalFeedbackSchema();
} catch (err) {
  logger.error({ err }, "Could not prepare the animal feedback table");
}
try {
  await ensureQrLocationSchema();
} catch (err) {
  logger.error({ err }, "Could not add location QR codes");
}
try {
  await ensureGamesSchema();
} catch (err) {
  logger.error({ err }, "Could not prepare the game tables");
}
// Versioned schema changes (new tables, Row Level Security). Runs after the tables above exist.
try {
  await runMigrations();
} catch (err) {
  logger.error({ err }, "Database migration failed");
}
try {
  // A backup that was running when the server stopped can't finish; record it as failed
  const { pool } = await import("@workspace/db");
  await pool.query("UPDATE backups SET status = 'failed', finished_at = now(), error = 'Interrupted: the server restarted before it finished' WHERE status = 'running'");
} catch (err) {
  logger.error({ err }, "Could not check for interrupted backups");
}
try {
  await seedVerifiedTicketPrices();
} catch (err) {
  logger.error({ err }, "Could not add the verified ticket prices");
}
try {
  await fixSeedAnimalPhotos();
} catch (err) {
  logger.error({ err }, "Could not update seed animal photos");
}
try {
  await fixSeedVisitInfo();
} catch (err) {
  logger.error({ err }, "Could not update seed hours and ticket prices");
}
try {
  await upgradePlaceholderLayout();
} catch (err) {
  logger.error({ err }, "Could not load the Manila Zoo map layout");
}
try {
  await assignMissingAnimalLocations();
} catch (err) {
  logger.error({ err }, "Could not place animals at their exhibits");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Card-size copies of uploaded photos, made in the background (see routes/images.ts)
  setTimeout(() => { warmThumbnails().catch(err => logger.warn({ err }, "Could not prepare photo thumbnails")); }, 5_000);
});
