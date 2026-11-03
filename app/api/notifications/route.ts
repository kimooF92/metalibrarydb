import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityNotifications } from "@/db/schema";
import { desc, eq, ne, and, inArray, sql, lt, or } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { getCached, setCached, deleteCached } from "@/lib/cache-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const summaryOnly = searchParams.get("summary") === "true";
    const cursor = searchParams.get("cursor");

    const activeWorkspace = await getActiveWorkspace(req);

    // Fast-path for secondary navbar polling (cached 15s to eliminate duplicate mobile/desktop hits)
    if (summaryOnly) {
      const cacheKey = `cache:notifications:summary:${activeWorkspace.id}`;
      const cached = await getCached<{ unreadCount: number }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          notifications: [],
          unreadCount: cached.unreadCount,
        }, { headers: { "Cache-Control": "private, max-age=10" } });
      }

      const [unreadCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityNotifications)
        .where(and(eq(activityNotifications.isRead, false), eq(activityNotifications.workspaceId, activeWorkspace.id)));

      const unreadCount = unreadCountResult?.count || 0;
      await setCached(cacheKey, { unreadCount }, 15);

      return NextResponse.json({
        success: true,
        notifications: [],
        unreadCount,
      }, { headers: { "Cache-Control": "private, max-age=10" } });
    }

    const conditions = [
      eq(activityNotifications.workspaceId, activeWorkspace.id),
    ];
    if (type && type !== "all") {
      if (type === "activity") {
        conditions.push(ne(activityNotifications.type, "breakout_alert"));
      } else if (type.includes(",")) {
        const types = type.split(",").map((t) => t.trim()).filter(Boolean);
        conditions.push(inArray(activityNotifications.type, types));
      } else {
        conditions.push(eq(activityNotifications.type, type));
      }
    }
    if (unreadOnly) {
      conditions.push(eq(activityNotifications.isRead, false));
    }

    if (cursor) {
      if (cursor.includes("|")) {
        const [cursorTimeStr, cursorId] = cursor.split("|");
        const cursorTime = new Date(cursorTimeStr);
        if (!isNaN(cursorTime.getTime())) {
          conditions.push(
            or(
              lt(activityNotifications.createdAt, cursorTime),
              and(
                eq(activityNotifications.createdAt, cursorTime),
                sql`${activityNotifications.id} < ${cursorId}::uuid`
              )
            )!
          );
        }
      } else {
        const cursorTime = new Date(cursor);
        if (!isNaN(cursorTime.getTime())) {
          conditions.push(lt(activityNotifications.createdAt, cursorTime));
        }
      }
    }

    // Lean projection & fetch limit + 1 to determine hasMore without count scans
    const rows = await db.query.activityNotifications.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(activityNotifications.createdAt), desc(activityNotifications.id)],
      limit: limit + 1,
      columns: {
        id: true,
        type: true,
        title: true,
        message: true,
        severity: true,
        trackedPageId: true,
        adArchiveId: true,
        actionUrl: true,
        metadata: true,
        isRead: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const notifications = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = notifications[notifications.length - 1];
    const toIso = (d: any) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
    const nextCursor = hasMore && lastItem ? `${toIso(lastItem.createdAt)}|${lastItem.id}` : null;

    let unreadCount: number | undefined = undefined;
    if (!cursor) {
      // Only count unread notifications on initial load (skip on infinite scroll pages to save db scan quota)
      const [unreadCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityNotifications)
        .where(and(eq(activityNotifications.isRead, false), eq(activityNotifications.workspaceId, activeWorkspace.id)));

      unreadCount = unreadCountResult?.count || 0;
    }

    return NextResponse.json({
      success: true,
      notifications,
      nextCursor,
      hasMore,
      ...(unreadCount !== undefined ? { unreadCount } : {}),
    }, { headers: { "Cache-Control": "private, no-cache, must-revalidate" } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const body = await req.json();
    const { id, ids, action } = body;

    if (action === "mark_all_read") {
      await db
        .update(activityNotifications)
        .set({ isRead: true })
        .where(
          and(
            eq(activityNotifications.isRead, false),
            eq(activityNotifications.workspaceId, activeWorkspace.id)
          )
        );

      await deleteCached(`cache:notifications:summary:${activeWorkspace.id}`);
      return NextResponse.json({ success: true, message: "Marked all notifications as read." });
    }

    const targetReadStatus = typeof body.isRead === "boolean" ? body.isRead : true;

    if (Array.isArray(ids) && ids.length > 0) {
      await db
        .update(activityNotifications)
        .set({ isRead: targetReadStatus })
        .where(inArray(activityNotifications.id, ids));

      await deleteCached(`cache:notifications:summary:${activeWorkspace.id}`);
      return NextResponse.json({ success: true, message: `Marked ${ids.length} notifications as ${targetReadStatus ? "read" : "unread"}.` });
    }

    if (id) {
      await db
        .update(activityNotifications)
        .set({ isRead: targetReadStatus })
        .where(eq(activityNotifications.id, id));

      await deleteCached(`cache:notifications:summary:${activeWorkspace.id}`);
      return NextResponse.json({ success: true, message: `Notification marked as ${targetReadStatus ? "read" : "unread"}.` });
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
    const activeWorkspace = await getActiveWorkspace(req);
    const body = await req.json().catch(() => ({}));
    const { id, clearAll } = body;

    if (clearAll) {
      await db
        .delete(activityNotifications)
        .where(eq(activityNotifications.workspaceId, activeWorkspace.id));
      await deleteCached(`cache:notifications:summary:${activeWorkspace.id}`);
      return NextResponse.json({ success: true, message: "Cleared all notifications." });
    }

    if (id) {
      await db.delete(activityNotifications).where(eq(activityNotifications.id, id));
      await deleteCached(`cache:notifications:summary:${activeWorkspace.id}`);
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
