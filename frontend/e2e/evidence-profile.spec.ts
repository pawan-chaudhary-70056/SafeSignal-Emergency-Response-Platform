import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const fixtureDir = fileURLToPath(new URL("./fixtures", import.meta.url));

const PASSWORD = "Password123!";
const description = `E2E evidence report: fire drill smoke at the warehouse (${Date.now()})`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
}

test("citizen attaches evidence and updates their profile", async ({ browser }) => {
  test.setTimeout(180_000);

  const citizenContext = await browser.newContext();
  const dispatcherContext = await browser.newContext();
  const citizen = await citizenContext.newPage();
  const dispatcher = await dispatcherContext.newPage();

  try {
    // 1. Citizen reports an incident and opens its details.
    await signIn(citizen, "citizen@safesignal.local");
    await citizen.getByLabel(/What is happening/).fill(description);
    await citizen.getByLabel(/Contact number/).fill("+9779800000000");
    await citizen.getByLabel(/Landmark or location description/).fill("Warehouse loading bay 3");
    await citizen.getByRole("button", { name: "Submit emergency report" }).click();
    await expect(citizen.getByText(/Emergency report submitted\. Reference: /)).toBeVisible();

    const queueItem = citizen.getByRole("button").filter({ hasText: description });
    await expect(queueItem).toBeVisible();
    await queueItem.click();
    await expect(citizen.getByRole("heading", { name: /Evidence/i })).toBeVisible();
    await expect(citizen.getByText("No evidence attached yet.")).toBeVisible();

    // 2. Citizen attaches a small PNG as supporting evidence.
    const png = readFileSync(join(fixtureDir, "evidence-pixel.png"));
    await citizen
      .getByRole("button", { name: "Attach evidence file" })
      .setInputFiles({
        name: "smoke-photo.png",
        mimeType: "image/png",
        buffer: png,
      });

    const evidenceRow = citizen.locator("li").filter({ hasText: "smoke-photo.png" });
    await expect(evidenceRow).toBeVisible();
    await expect(evidenceRow.getByText("PNG", { exact: true })).toBeVisible();
    await expect(citizen.getByText(/Attached “smoke-photo\.png”\./)).toBeVisible();
    await expect(
      evidenceRow.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("download", "smoke-photo.png");

    // 3. The dispatcher sees the same evidence in the incident panel.
    await signIn(dispatcher, "dispatcher@safesignal.local");
    const dispatcherItem = dispatcher.getByRole("button").filter({ hasText: description });
    await expect(dispatcherItem).toBeVisible();
    await dispatcherItem.click();
    await expect(dispatcher.locator("li").filter({ hasText: "smoke-photo.png" })).toBeVisible();

    // 4. The citizen manages their profile (FR-005). The suite is rerunnable,
    // so the current name is accepted whatever previous runs left behind.
    await citizen.getByRole("link", { name: "My profile" }).click();
    const nameField = citizen.getByLabel("Full name");
    await expect(nameField).not.toBeEmpty();
    await nameField.fill("Updated Demo Citizen");
    await citizen
      .getByLabel("Phone number")
      .fill("+9779812345678");
    await citizen.getByRole("button", { name: "Save profile" }).click();
    await expect(citizen.getByText("Profile updated.")).toBeVisible();

    // The sidebar reflects the new name on the next render.
    await expect(citizen.getByText("Updated Demo Citizen").first()).toBeVisible();

    // Protected fields stay read-only.
    await expect(citizen.getByText("citizen@safesignal.local").first()).toBeVisible();
    await expect(citizen.getByText("Citizen", { exact: true }).first()).toBeVisible();
  } finally {
    await Promise.all([citizenContext.close(), dispatcherContext.close()]);
  }
});
