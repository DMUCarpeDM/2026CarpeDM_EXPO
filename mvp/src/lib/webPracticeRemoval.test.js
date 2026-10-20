import assert from "node:assert/strict";
import test from "node:test";
import { currentScreenDestination } from "./serviceEntryRoute.js";

test("retired web practice screens return to home while mirror screens remain available", () => {
  for (const screen of ["role", "scenario", "difficulty", "preview", "practice", "result", "feedback", "compare", "share"]) {
    assert.equal(currentScreenDestination(screen, false), "home");
    assert.equal(currentScreenDestination(screen, true), screen);
  }
});

test("public web pages remain available", () => {
  for (const screen of ["home", "service", "intro", "usage", "records", "pricing", "login", "signup"]) {
    assert.equal(currentScreenDestination(screen, false), screen);
  }
});
