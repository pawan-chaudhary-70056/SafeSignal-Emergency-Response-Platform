import { expect, test, type Locator } from "@playwright/test";

async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const toRgb = (color: string): [number, number, number] => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context unavailable");
      context.fillStyle = "#000000";
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2]];
    };

    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const foreground = toRgb(getComputedStyle(element).color);
    let node: HTMLElement | null = element;
    let background: [number, number, number] = [255, 255, 255];
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        background = toRgb(color);
        break;
      }
      node = node.parentElement;
    }

    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  });
}

test("skip link and keyboard focus are visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content/);

  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
});

test("body and muted text meet AA contrast in light and dark themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const intro = page.getByText(/^Report an emergency in seconds/);
  const footer = page.locator("footer p").first();

  expect(await contrastRatio(intro)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastRatio(footer)).toBeGreaterThanOrEqual(4.5);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  expect(await contrastRatio(intro)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastRatio(footer)).toBeGreaterThanOrEqual(4.5);
});
