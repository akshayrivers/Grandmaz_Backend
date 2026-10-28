import { afterEach, describe, expect, it } from "vitest";
import {
  assertLocalFlowAllowed,
  isLocalCaretakerToken,
  LOCAL_CARETAKER_TOKEN,
  localFlowEnabled,
} from "../../src/config/local-flow.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_LOCAL = process.env.LOCAL_FLOW;
const ORIGINAL_BYPASS = process.env.AUTH_BYPASS;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_LOCAL === undefined) delete process.env.LOCAL_FLOW;
  else process.env.LOCAL_FLOW = ORIGINAL_LOCAL;
  if (ORIGINAL_BYPASS === undefined) delete process.env.AUTH_BYPASS;
  else process.env.AUTH_BYPASS = ORIGINAL_BYPASS;
});

describe("local flow flag", () => {
  it("stays off unless the flag is set", () => {
    process.env.NODE_ENV = "development";
    delete process.env.LOCAL_FLOW;
    delete process.env.AUTH_BYPASS;
    expect(localFlowEnabled()).toBe(false);
    expect(() => assertLocalFlowAllowed()).not.toThrow();
  });

  it("refuses to start when the flag is combined with production", () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_FLOW = "1";
    expect(() => assertLocalFlowAllowed()).toThrow(/NODE_ENV=production/);
    expect(localFlowEnabled()).toBe(false);
    expect(isLocalCaretakerToken(LOCAL_CARETAKER_TOKEN)).toBe(false);
  });

  it("accepts the flag only outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_BYPASS = "1";
    expect(localFlowEnabled()).toBe(true);
    expect(isLocalCaretakerToken(LOCAL_CARETAKER_TOKEN)).toBe(true);
    expect(isLocalCaretakerToken("someone-else")).toBe(false);
    expect(() => assertLocalFlowAllowed()).not.toThrow();
  });
});
