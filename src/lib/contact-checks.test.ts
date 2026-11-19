import { describe, expect, it } from "vitest";
import { cellProblem, columnKind, emailProblem, phoneProblem } from "./contact-checks";

describe("contact checks", () => {
  it("flags a name typed into an email field", () => {
    expect(emailProblem("azhar")).not.toBeNull();
    expect(emailProblem("azhar@outthere.com.au")).toBeNull();
    expect(emailProblem("")).toBeNull();
  });
  it("checks phone numbers", () => {
    expect(phoneProblem("0412 345 678")).toBeNull();
    expect(phoneProblem("+61 (2) 6123 4567")).toBeNull();
    expect(phoneProblem("call Bob")).not.toBeNull();
    expect(phoneProblem("1234")).not.toBeNull();
  });
  it("reads column headings", () => {
    expect(columnKind("Email")).toBe("email");
    expect(columnKind("Mobile")).toBe("tel");
    expect(columnKind("Name")).toBe("person");
    expect(columnKind("Contact person")).toBe("person");
    expect(columnKind("Company name")).toBe("text");
    expect(columnKind("Role")).toBe("text");
    expect(cellProblem("E-mail", "clare")).not.toBeNull();
  });
});
