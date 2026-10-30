import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBreakoutCriteria } from "./breakout-detector";

test("evaluateBreakoutCriteria rejects ads with duplicationCount < 3", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 2,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, false);
  assert.ok(result.reason.includes("min 3 copies required"));
});

test("evaluateBreakoutCriteria rejects inactive ads", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 5,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    isActive: false,
  });

  assert.equal(result.isBreakout, false);
});

test("evaluateBreakoutCriteria rejects unvalidated test ads running < 7 days", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 4,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, false);
  assert.ok(result.reason.includes("initial test window"));
});

test("evaluateBreakoutCriteria rejects mature ads running > 30 days", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 5,
    prevDuplication: 2,
    startedRunningOn: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, false);
  assert.ok(result.reason.includes("mature/evergreen window"));
});

test("evaluateBreakoutCriteria identifies test-to-scale breakout in 7-30d window", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 3,
    prevDuplication: 1,
    startedRunningOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 2);
  assert.ok(result.reason.includes("Crossed scaling threshold"));
  assert.ok(result.winnerScore >= 45);
  assert.ok(typeof result.breakoutScore === "number");
  assert.ok(result.breakoutTier !== null);
});

test("evaluateBreakoutCriteria identifies rapid scaling surge in 7-30d window", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 6,
    prevDuplication: 3,
    startedRunningOn: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 3);
  assert.ok(result.reason.includes("Scaling surge"));
  assert.ok(result.breakoutScore && result.breakoutScore >= 60);
});

test("evaluateBreakoutCriteria identifies validated scaler observed in 7-30d window", () => {
  const result = evaluateBreakoutCriteria({
    currentDuplication: 4,
    prevDuplication: null,
    startedRunningOn: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  assert.equal(result.isBreakout, true);
  assert.equal(result.scaleJump, 4);
  assert.ok(result.reason.includes("Validated scaler"));
});
