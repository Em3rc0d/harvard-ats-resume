import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/resume/ResumeWorkspace.tsx", "utf8");

describe("B9 ResumeProfile initialization race", () => {
  it("does not let a stale initial profile read overwrite user edits or a successful save", () => {
    expect(workspace).toContain('import { useEffect, useMemo, useRef, useState } from "react"');
    expect(workspace).toContain("const profileMutationEpoch = useRef(0)");
    expect(workspace).toContain("const profileLoadEpoch = profileMutationEpoch.current");
    expect(workspace).toContain("profileLoadEpoch === profileMutationEpoch.current");
    expect(workspace).toContain("function updateProfileDraft(patch: Partial<ProfileDraft>)");
    expect(workspace).toContain("profileMutationEpoch.current += 1");
    expect(workspace).toContain("setProfile(saved)");
    expect(workspace).toContain("setProfileDraft(profileToDraft(saved))");
  });
});
