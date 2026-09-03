import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("B8 public error boundaries", () => {
  it("does not expose internal Account lifecycle error messages", () => {
    const helper = readFileSync("src/interfaces/http/b8AccountResponse.ts", "utf8");
    const exportRoute = readFileSync("src/app/api/account/export/route.ts", "utf8");
    const deleteRoute = readFileSync("src/app/api/account/delete/route.ts", "utf8");
    expect(helper).toContain("AuthenticationRequiredError");
    expect(helper).toContain('error: "UNAUTHENTICATED"');
    expect(helper).toContain('error: "DURABLE_STORE_NOT_CONFIGURED"');
    expect(helper).toContain('"B8_ACCOUNT_EXPORT_FAILED"');
    expect(helper).toContain('"B8_ACCOUNT_DELETE_FAILED"');
    expect(exportRoute).not.toContain("result.error.message");
    expect(deleteRoute).not.toContain("result.error.message");
    expect(deleteRoute).toContain("result.data !== true");
  });

  it("does not misreport every AI status failure as authentication failure", () => {
    const route = readFileSync("src/app/api/ai/status/route.ts", "utf8");
    expect(route).toContain("AuthenticationRequiredError");
    expect(route).toContain('error: "UNAUTHENTICATED"');
    expect(route).toContain('error: "DURABLE_STORE_NOT_CONFIGURED"');
    expect(route).toContain('error: "AI_STATUS_UNAVAILABLE"');
    expect(route).toContain("status: 500");
  });
});
