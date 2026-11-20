import { Router } from "express";
import { eq, sql, gte, and, desc } from "drizzle-orm";
import { db, analyticsTable, animalsTable, chatHistoryTable, favoritesTable, mapPinsTable, qrCodesTable } from "@workspace/db";
import { TrackAnalyticsEventBody } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { supabase } from "../lib/supabase";

const router = Router();

router.post("/analytics/track", async (req, res): Promise<void> => {
  const parsed = TrackAnalyticsEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(analyticsTable).values({
    eventType: parsed.data.event_type,
    animalId: parsed.data.animal_id ?? undefined,
    sessionId: parsed.data.session_id ?? undefined,
    metadata: parsed.data.metadata ? { raw: parsed.data.metadata } : undefined,
  }).returning();
  res.status(201).json(row);
});

// Reports are for administrators only
router.get("/reports/dashboard", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [
    [{ count: totalAnimals }],
    [{ count: totalQrScans }],
    [{ count: totalChatMessages }],
    [{ count: totalVisitorsToday }],
    [{ count: totalFavorites }],
    [{ count: totalMapPins }],
    chatStats,
  ] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(animalsTable),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(analyticsTable).where(eq(analyticsTable.eventType, "qr_scan")),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(chatHistoryTable).where(eq(chatHistoryTable.role, "user")),
    // Visitors, not events: distinct sessions seen today (chat sessions; QR scans carry no session)
    db.select({ count: sql<number>`cast(count(distinct ${analyticsTable.sessionId}) as int)` }).from(analyticsTable).where(gte(analyticsTable.createdAt, today)),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(favoritesTable),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(mapPinsTable).where(eq(mapPinsTable.isActive, true)),
    db.select({ confidence: chatHistoryTable.confidence }).from(chatHistoryTable).where(eq(chatHistoryTable.role, "assistant"))
      .orderBy(desc(chatHistoryTable.createdAt)).limit(100),
  ]);
  // Accounts live in Supabase Auth, not in the zoo database
  const { data: accounts } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const totalUsers = accounts?.users.length ?? 0;

  const avgConf = chatStats.length > 0
    ? chatStats.reduce((s: number, r: { confidence: string | null }) => s + Number(r.confidence || 0), 0) / chatStats.length * 100
    : null;

  res.json({ total_animals: totalAnimals, total_users: totalUsers, total_qr_scans: totalQrScans, total_chat_messages: totalChatMessages, total_visitors_today: totalVisitorsToday, total_favorites: totalFavorites, total_map_pins: totalMapPins, chatbot_accuracy: avgConf });
});

router.get("/reports/popular-animals", requireAdmin, async (req, res): Promise<void> => {
  const limit = Number(req.query.limit) || 10;
  const animals = await db.select({ id: animalsTable.id, name: animalsTable.name, imageUrl: animalsTable.imageUrl, viewCount: animalsTable.viewCount }).from(animalsTable).orderBy(sql`${animalsTable.viewCount} DESC`).limit(limit);
  const qrStats = await db.select({ animalId: qrCodesTable.animalId, scanCount: qrCodesTable.scanCount }).from(qrCodesTable);
  const qrMap = new Map<number, number>();
  qrStats.forEach(q => { if (q.animalId) qrMap.set(q.animalId, (qrMap.get(q.animalId) ?? 0) + (q.scanCount ?? 0)); });
  res.json(animals.map(a => ({ animal_id: a.id, animal_name: a.name, image_url: a.imageUrl, view_count: a.viewCount, qr_scan_count: qrMap.get(a.id) ?? 0 })));
});

router.get("/reports/chatbot", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [messages, [{ count: messagesToday }]] = await Promise.all([
    db.select({ intent: chatHistoryTable.intent, confidence: chatHistoryTable.confidence }).from(chatHistoryTable).where(eq(chatHistoryTable.role, "assistant")),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(chatHistoryTable).where(and(eq(chatHistoryTable.role, "user"), gte(chatHistoryTable.createdAt, today))),
  ]);
  const intentCounts = new Map<string, number>();
  let totalConf = 0;
  messages.forEach(m => { intentCounts.set(m.intent ?? "unknown", (intentCounts.get(m.intent ?? "unknown") ?? 0) + 1); totalConf += Number(m.confidence ?? 0); });
  const topIntents = [...intentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([intent, count]) => ({ intent, count }));
  res.json({ total_messages: messages.length, avg_confidence: messages.length ? totalConf / messages.length : 0, top_intents: topIntents, messages_today: messagesToday, positive_feedback_pct: null });
});

router.get("/reports/qr-scans", requireAdmin, async (_req, res): Promise<void> => {
  // Location codes (restrooms, gates…) have no animal; name them by their map place
  const rows = await db.select({ animalId: qrCodesTable.animalId, scanCount: qrCodesTable.scanCount, animal_name: animalsTable.name, place_name: mapPinsTable.name })
    .from(qrCodesTable)
    .leftJoin(animalsTable, eq(qrCodesTable.animalId, animalsTable.id))
    .leftJoin(mapPinsTable, eq(qrCodesTable.mapPinId, mapPinsTable.id))
    .orderBy(sql`${qrCodesTable.scanCount} DESC`).limit(10);
  res.json(rows.map(r => ({ animal_id: r.animalId, animal_name: r.animal_name ?? r.place_name ?? "Unknown", scan_count: r.scanCount ?? 0 })));
});

export default router;
