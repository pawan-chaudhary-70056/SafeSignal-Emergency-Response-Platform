import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Password123!";

const workspaces = [
  {
    label: "Citizen",
    email: "citizen@safesignal.local",
    sections: ["overview", "report", "incidents", "map", "reports"],
    destination: { id: "incidents", link: "My incidents" },
  },
  {
    label: "Dispatcher",
    email: "dispatcher@safesignal.local",
    sections: ["overview", "queue", "responders", "map", "reports"],
    destination: { id: "responders", link: "Available responders" },
  },
  {
    label: "Responder",
    email: "responder@safesignal.local",
    sections: ["overview", "profile", "assignments", "map", "reports"],
    destination: { id: "assignments", link: "Assignments" },
  },
  {
    label: "Administrator",
    email: "admin@safesignal.local",
    sections: ["overview", "users", "audit", "reports"],
    destination: { id: "audit", link: "Audit log" },
  },
];

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    dimensions.scrollWidth,
    `document scroll width ${dimensions.scrollWidth}px exceeds viewport ${dimensions.clientWidth}px`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("public pages fit a mobile viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

for (const workspace of workspaces) {
  test(`${workspace.label} workspace navigation works on mobile`, async ({ page }) => {
    await signIn(page, workspace.email);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
    await expect(drawer).toBeVisible();

    for (const section of workspace.sections) {
      await expect(page.locator(`#${section}`)).toHaveCount(1);
    }

    await drawer.getByRole("link", { name: workspace.destination.link }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#${workspace.destination.id}$`));
    await expect(page.locator(`#${workspace.destination.id}`)).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
}
