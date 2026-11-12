import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Password123!";

function animationName(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
}

test.describe("motion preferences", () => {
  test("decorative animations run when motion is allowed", async ({ page }) => {
    await page.goto("/");

    expect(await animationName(page, ".animate-fade-up")).not.toBe("none");
    expect(await animationName(page, ".text-aurora")).not.toBe("none");
  });

  test("reduced motion disables animations and keeps content readable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    expect(await animationName(page, ".animate-fade-up")).toBe("none");
    expect(await animationName(page, ".animate-float-slow")).toBe("none");
    expect(await animationName(page, ".text-aurora")).toBe("none");

    const scrollBehavior = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(scrollBehavior).toBe("auto");

    // Scroll-reveal sections must not stay hidden when motion is reduced.
    const revealOpacity = await page
      .getByText("One platform, three clear workspaces")
      .evaluate((element) => {
        let node: HTMLElement | null = element as HTMLElement;
        while (node && !node.className.includes("motion-reduce:opacity-100")) {
          node = node.parentElement;
        }
        return node ? getComputedStyle(node).opacity : null;
      });
    expect(revealOpacity).toBe("1");

    // Dashboard entry animation is disabled too.
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await page.getByLabel("Email").fill("citizen@safesignal.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    expect(await animationName(page, ".animate-page-in")).toBe("none");
  });
});
