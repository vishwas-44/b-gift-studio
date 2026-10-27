import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordField } from "@/components/ui/password-field";

describe("PasswordField", () => {
  it("shows and hides the entered password without changing its value", () => {
    render(
      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        value="correct horse"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("correct horse");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("correct horse");
  });
});
