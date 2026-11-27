import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

const WITH_IMAGE = "Check tests.\n\n![tracker](https://attacker.example/pixel.png)";

describe("Markdown", () => {
  it("document mode prints an image reference instead of loading it", () => {
    const { container } = render(<Markdown doc>{WITH_IMAGE}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/\[image: tracker\] https:\/\/attacker\.example\/pixel\.png/)).toBeInTheDocument();
  });

  it("compact mode keeps the default image rendering", () => {
    const { container } = render(<Markdown>{WITH_IMAGE}</Markdown>);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
