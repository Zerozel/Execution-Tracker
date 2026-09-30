// ============================================================
// Execution Tracker — Slicing Pie: Test Runner
// ============================================================
// Imports every suite so a single `node run-all.js` executes them all.
// Each suite calls process.exit(1) on failure, so the first failing
// suite fails the whole run (CI-friendly).
// ============================================================

import "./foundation.test";
import "./engine.test";
import "./policy.test";
import "./well.test";
import "./departure.test";
import "./records.test";

// eslint-disable-next-line no-console
console.log("\n\u2705 All Slicing Pie test suites completed successfully.");
