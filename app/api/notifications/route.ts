import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityNotifications } from "@/db/schema";
import { desc, eq, and, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const conditions = [];
    if (type && type !== "all") {
      if (type.includes(",")) {
        const types = type.split(",").map((t) => t.trim()).filter(Boolean);
        conditions.push(inArray(activityNotifications.type, types));
      } else {
        conditions.push(eq(activityNotifications.type, type));
      }
    }
    if (unreadOnly) {
      conditions.push(eq(activityNotifications.isRead, false));
    }

    const notifications = await db.query.activityNotifications.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(activityNotifications.createdAt)],
      limit,
    });

    // Count unread notifications
    const [unreadCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityNotifications)
      .where(eq(activityNotifications.isRead, false));

    const unreadCount = unreadCountResult?.count || 0;

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ids, action } = body;

    if (action === "mark_all_read") {
      await db
        .update(activityNotifications)
        .set({ isRead: true })
        .where(eq(activityNotifications.isRead, false));

      return NextResponse.json({ success: true, message: "Marked all notifications as read." });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      await db
        .update(activityNotifications)
        .set({ isRead: true })
        .where(inArray(activityNotifications.id, ids));

      return NextResponse.json({ success: true, message: `Marked ${ids.length} notifications as read.` });
    }

    if (id) {
      await db
        .update(activityNotifications)
        .set({ isRead: true })
        .where(eq(activityNotifications.id, id));

      return NextResponse.json({ success: true, message: "Notification marked as read." });
    }

    return NextResponse.json({ error: "Missing id, ids, or action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update notification" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, clearAll } = body;

    if (clearAll) {
      await db.delete(activityNotifications);
      return NextResponse.json({ success: true, message: "Cleared all notifications." });
    }

    if (id) {
      await db.delete(activityNotifications).where(eq(activityNotifications.id, id));
      return NextResponse.json({ success: true, message: "Notification deleted." });
    }

    return NextResponse.json({ error: "Missing id or clearAll" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete notification" },
      { status: 500 }
    );
  }
}
