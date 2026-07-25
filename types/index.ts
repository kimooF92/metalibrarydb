export interface TrackedPage {
  id: string;
  url: string;
  displayName: string | null;
  searchType: string | null;
  pageId: string | null;
  currentResults: number | null;
  previousResults?: number | null;
  difference?: number | null;
  lastChecked: string | null;
  lastSuccessAt: string | null;
  status: "pending" | "scanning" | "success" | "failed" | "unclear";
  createdAt: string;
  updatedAt: string;
  // Extended fields
  failureReason?: string | null;
  attempts?: number | null;
  notes?: string | null;
  isWatchlisted?: boolean;
}

export interface ScanHistoryEntry {
  id: string;
  trackedPageId: string;
  results: number | null;
  difference: number | null;
  checkedAt: string;
  status: "success" | "failed" | "unclear";
  failureReason?: string | null;
}

export interface WorkerState {
  id: number;
  isPaused: boolean;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  backoffUntil: string | null;
  scansThisHour: number;
  hourWindowStart: string | null;
  scansToday: number;
  dayWindowStart: string | null;
  updatedAt: string;
}

export interface DashboardStats {
  totalPages: number;
  pending: number;
  scanning: number;
  completed: number;
  failed: number;
  unclear: number;
  averageResults: number;
  highestResults: number;
  lastImport: {
    id: string;
    filename: string;
    createdAt: string;
    totalRows: number;
  } | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TopMover {
  id: string;
  displayName: string | null;
  url: string;
  currentResults: number | null;
  difference: number;
}
