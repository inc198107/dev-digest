import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostBadge, formatUsd } from "./CostBadge";

describe("formatUsd", () => {
  it("renders unknown cost as an em-dash, never $0", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("grows precision as the amount shrinks", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0000005)).toBe("<$0.000001");
    expect(formatUsd(5.688592e-5)).toBe("$0.000057");
    expect(formatUsd(0.00023653)).toBe("$0.00024");
    expect(formatUsd(0.0001)).toBe("$0.0001");
    expect(formatUsd(0.0013)).toBe("$0.0013");
    expect(formatUsd(0.01)).toBe("$0.010");
    expect(formatUsd(0.014)).toBe("$0.014");
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("CostBadge", () => {
  it("shows the formatted cost with its tooltip", () => {
    render(<CostBadge usd={0.0013} title="Cost of this review" />);
    expect(screen.getByText("$0.0013")).toHaveAttribute("title", "Cost of this review");
  });

  it("shows an em-dash when the cost is unknown", () => {
    render(<CostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
