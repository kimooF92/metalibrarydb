export interface ActivityNotification {
  id: string;
  type:
    | "count_scan"
    | "ad_spy"
    | "page_merged"
    | "multi_page_detected"
    | "domain_portfolio_linked"
    | "batch_summary"
    | "system_alert"
    | "breakout_alert"
    | "supplier_album_drop";
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  trackedPageId?: string | null;
  adArchiveId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

export type NotificationTab = "all" | "breakout_alert" | "activity";

export interface NotificationCenterProps {
  layout?: "sidebar" | "navbar" | "collapsed";
  onOpenResolveModal?: (trackedPageId: string) => void;
}

