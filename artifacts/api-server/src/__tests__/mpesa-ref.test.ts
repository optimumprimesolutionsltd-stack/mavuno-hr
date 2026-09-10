/**
 * Billing account number — round-trip and typo rejection.
 */

import { describe, it, expect } from "vitest";
import { accountReferenceFor, parseAccountReference } from "../lib/mpesa.js";

describe("accountReferenceFor / parseAccountReference", () => {
  it("round-trips org ids", () => {
    for (const id of [1, 7, 42, 999, 123456, 999999]) {
      const ref = accountReferenceFor(id);
      expect(parseAccountReference(ref)).toBe(id);
    }
  });

  it("produces an MHR- prefix, 6 digits, one check char (11 chars)", () => {
    const ref = accountReferenceFor(42);
    expect(ref).toMatch(/^MHR-\d{6}[0-9A-Z]$/);
    expect(ref.length).toBe(11);
  });

  it("is tolerant of case, spaces and stray dashes on input", () => {
    const ref = accountReferenceFor(42); // e.g. "MHR-000042K"
    const digitsAndChk = ref.replace("MHR-", "");
    expect(parseAccountReference(ref.toLowerCase())).toBe(42);
    expect(parseAccountReference(`mhr ${digitsAndChk.slice(0, 6)} ${digitsAndChk.slice(6)}`)).toBe(42);
    expect(parseAccountReference(`MHR-${digitsAndChk.slice(0, 6)}-${digitsAndChk.slice(6)}`)).toBe(42);
  });

  it("rejects a wrong check character (a typo)", () => {
    const ref = accountReferenceFor(42);
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const wrongChk = chars[(chars.indexOf(ref.slice(-1)) + 1) % 36];
    expect(parseAccountReference(ref.slice(0, -1) + wrongChk)).toBeNull();
  });

  it("rejects a single mistyped digit", () => {
    // MHR-000042K with the last digit bumped 2 -> 3 will (almost always) fail
    // the check. Test a specific known-bad pair.
    const good = accountReferenceFor(42);
    const bad = good.replace("000042", "000043"); // different id, old check char
    expect(parseAccountReference(bad)).toBeNull();
  });

  it("rejects junk", () => {
    for (const s of ["", "MHR-", "MHR-12345K", "ABC-000042K", "000042K", "MHR-0000042"]) {
      expect(parseAccountReference(s)).toBeNull();
    }
  });
});
