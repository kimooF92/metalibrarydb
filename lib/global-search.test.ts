import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/search/global/route";
import { NextRequest } from "next/server";

const secret = process.env.API_SECRET || process.env.APP_PASSWORD || "";
const headers = { "x-api-secret": secret };

test("Global search returns empty arrays when query length is less than 2", async () => {
  const reqShort = new NextRequest("http://localhost:3000/api/search/global?q=a", { headers });
  const res = await GET(reqShort);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(data, { brands: [], products: [], ads: [] });

  const reqEmpty = new NextRequest("http://localhost:3000/api/search/global?q=", { headers });
  const resEmpty = await GET(reqEmpty);
  const dataEmpty = await resEmpty.json();

  assert.equal(resEmpty.status, 200);
  assert.deepEqual(dataEmpty, { brands: [], products: [], ads: [] });
});

test("Global search trims whitespace properly", async () => {
  const reqSpaces = new NextRequest("http://localhost:3000/api/search/global?q=%20%20%20", { headers });
  const res = await GET(reqSpaces);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(data, { brands: [], products: [], ads: [] });
});

