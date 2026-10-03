import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBreakoutCriteria } from "./breakout-detector";

test("evaluateBreakoutCriteria rejects ads with duplicationCount < 3", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 2,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, false);
  assert.ok(result.reason.includes("min 3 copies required"));
});

test("evaluateBreakoutCriteria rejects inactive ads", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 5,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isActive: false,
  });

  assert.equal(result.isBreakout, false);
});

test("evaluateBreakoutCriteria rejects ads running for > 7 days", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 4,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, false);
  assert.ok(result.reason.includes("fresh window"));
});

test("evaluateBreakoutCriteria identifies test-to-scale breakout", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 3,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 2);
  assert.ok(result.reason.includes("Crossed threshold"));
  assert.ok(result.winnerScore >= 50);
});

test("evaluateBreakoutCriteria identifies rapid surge", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 5,
    prevDuplication: 3,
    startedRunningOn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 2);
  assert.ok(result.reason.includes("Surge"));
});

test("evaluateBreakoutCriteria identifies brand new ad launched <= 3 days ago", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 4,
    prevDuplication: null,
    startedRunningOn: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 4);
  assert.ok(result.reason.includes("Launched with high scale"));
});
