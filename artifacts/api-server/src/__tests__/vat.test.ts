import { describe, it, expect } from "vitest";
import { vatCents, withVatCents, cycleChargeCents } from "../lib/pricing.js";

describe("VAT on Mavuno bills", () => {
  it("adds 16% to a VAT-exclusive price", () => {
    expect(vatCents(150_000)).toBe(24_000);          // Lite KES 1,500 -> VAT 240
    expect(withVatCents(150_000)).toBe(174_000);     // KES 1,740 billed
  });
  it("applies to the annual invoice (10 months)", () => {
    expect(withVatCents(cycleChargeCents(250_000, "annual"))).toBe(2_900_000); // Starter 25,000 + 4,000
  });
  it("rounds to the cent and is zero for free", () => {
    expect(vatCents(0)).toBe(0);
    expect(vatCents(333)).toBe(53);
  });
});
