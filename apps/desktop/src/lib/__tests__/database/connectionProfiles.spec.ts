import { describe, expect, it } from "vitest";
import { CONNECTION_PICKER_OPTIONS, CONNECTION_PROFILES } from "@/types/generated/connectionProfiles";

describe("generated connection profiles", () => {
  it("keeps picker options unique and backed by profiles", () => {
    const optionIds = CONNECTION_PICKER_OPTIONS.map((option) => option.value);
    expect(new Set(optionIds).size).toBe(optionIds.length);
    expect(optionIds.every((id) => id in CONNECTION_PROFILES)).toBe(true);
  });

  it("contains only the retained database types", () => {
    expect(Object.keys(CONNECTION_PROFILES)).toEqual(["mysql", "postgres", "redis", "sqlite", "mongodb", "sqlserver", "opengauss"]);
    expect(CONNECTION_PROFILES.mysql).toMatchObject({ type: "mysql", port: 3306, user: "root" });
    expect(CONNECTION_PROFILES.opengauss).toMatchObject({ type: "opengauss", port: 5432, user: "gaussdb" });
  });
});
