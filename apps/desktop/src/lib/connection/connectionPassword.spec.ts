import { describe, expect, it } from "vitest";
import { connectionNeedsPasswordPrompt } from "@/lib/connection/connectionPassword";

describe("connectionNeedsPasswordPrompt", () => {
  it("keeps requiring a prompt for password-carrying connections with saving disabled", () => {
    expect(connectionNeedsPasswordPrompt({ db_type: "postgres", save_password: false, password: "" } as never)).toBe(true);
  });

  it("keeps skipping the prompt when a password is stored or saving is allowed", () => {
    expect(connectionNeedsPasswordPrompt({ db_type: "postgres", save_password: false, password: "pw" } as never)).toBe(false);
    expect(connectionNeedsPasswordPrompt({ db_type: "postgres", save_password: true, password: "" } as never)).toBe(false);
  });
});
