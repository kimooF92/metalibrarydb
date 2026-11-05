import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getDefaultDashboardState,
  sanitizeDashboardState,
  parseUrlParamsToState,
  serializeStateToUrlParams,
  buildQueryString,
} from "./url-filter-sync";

describe("url-filter-sync", () => {
  it("returns default dashboard state", () => {
    const defaults = getDefaultDashboardState();
    assert.strictEqual(defaults.search, "");
    assert.strictEqual(defaults.statusFilter, "all");
    assert.strictEqual(defaults.searchTypeFilter, "all");
    assert.strictEqual(defaults.tagFilter, "all");
    assert.strictEqual(defaults.activeTab, "active");
    assert.strictEqual(defaults.sortBy, "createdAt");
    assert.strictEqual(defaults.sortOrder, "desc");
    assert.strictEqual(defaults.page, 1);
    assert.strictEqual(defaults.pageSize, 25);
  });

  it("sanitizes invalid filter values against whitelists", () => {
    const sanitized = sanitizeDashboardState({
      statusFilter: "invalid_status" as any,
      searchTypeFilter: "hack" as any,
      tagFilter: "not_a_tag" as any,
      activeTab: "bogus_tab" as any,
      sortBy: "malicious_col" as any,
      sortOrder: "random" as any,
      pageSize: 9999 as any,
      page: -10,
    });

    assert.strictEqual(sanitized.statusFilter, "all");
    assert.strictEqual(sanitized.searchTypeFilter, "all");
    assert.strictEqual(sanitized.tagFilter, "all");
    assert.strictEqual(sanitized.activeTab, "active");
    assert.strictEqual(sanitized.sortBy, "createdAt");
    assert.strictEqual(sanitized.sortOrder, "desc");
    assert.strictEqual(sanitized.pageSize, 25);
    assert.strictEqual(sanitized.page, 1);
  });

  it("preserves valid values during sanitization", () => {
    const sanitized = sanitizeDashboardState({
      statusFilter: "success",
      searchTypeFilter: "keyword_exact_phrase",
      tagFilter: "scaling",
      activeTab: "watchlist",
      sortBy: "currentResults",
      sortOrder: "asc",
      pageSize: 50,
      page: 3,
    });

    assert.strictEqual(sanitized.statusFilter, "success");
    assert.strictEqual(sanitized.searchTypeFilter, "keyword_exact_phrase");
    assert.strictEqual(sanitized.tagFilter, "scaling");
    assert.strictEqual(sanitized.activeTab, "watchlist");
    assert.strictEqual(sanitized.sortBy, "currentResults");
    assert.strictEqual(sanitized.sortOrder, "asc");
    assert.strictEqual(sanitized.pageSize, 50);
    assert.strictEqual(sanitized.page, 3);
  });

  it("parses query string into validated state", () => {
    const query = "?search=nike&status=failed&tag=breakout&tab=attention&sortBy=difference&sortOrder=asc&page=4&limit=100";
    const state = parseUrlParamsToState(query);

    assert.strictEqual(state.search, "nike");
    assert.strictEqual(state.statusFilter, "failed");
    assert.strictEqual(state.tagFilter, "breakout");
    assert.strictEqual(state.activeTab, "attention");
    assert.strictEqual(state.sortBy, "difference");
    assert.strictEqual(state.sortOrder, "asc");
    assert.strictEqual(state.page, 4);
    assert.strictEqual(state.pageSize, 100);
  });

  it("ignores invalid URL params and falls back to base state", () => {
    const query = "?status=invalid_value&limit=42";
    const state = parseUrlParamsToState(query);

    assert.strictEqual(state.statusFilter, "all");
    assert.strictEqual(state.pageSize, 25);
  });

  it("serializes state omitting default values for clean URLs", () => {
    const defaultState = getDefaultDashboardState();
    const params = serializeStateToUrlParams(defaultState);
    assert.strictEqual(params.toString(), "");

    const customState = {
      ...defaultState,
      search: "adidas",
      statusFilter: "scanning" as const,
      page: 2,
      pageSize: 50 as const,
    };

    const customParams = serializeStateToUrlParams(customState);
    assert.strictEqual(customParams.get("search"), "adidas");
    assert.strictEqual(customParams.get("status"), "scanning");
    assert.strictEqual(customParams.get("page"), "2");
    assert.strictEqual(customParams.get("limit"), "50");
    assert.strictEqual(customParams.has("tab"), false); // 'active' is default, so omitted
  });

  it("builds query string with or without leading question mark", () => {
    const state = {
      ...getDefaultDashboardState(),
      search: "puma",
    };

    assert.strictEqual(buildQueryString(state, false), "search=puma");
    assert.strictEqual(buildQueryString(state, true), "?search=puma");
  });
});

