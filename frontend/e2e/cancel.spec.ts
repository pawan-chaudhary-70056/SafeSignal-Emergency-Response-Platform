import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Password123!";
const description = `E2E cancel report: gas leak smell near the kitchen block (${Date.now()})`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
}

test("citizen withdraws a report with the cancel request flow (FR-026)", async ({ browser }) => {
  test.setTimeout(180_000);

  const citizenContext = await browser.newContext();
  const citizen = await citizenContext.newPage();

  try {
    // 1. Citizen reports an incident and opens its details.
    await signIn(citizen, "citizen@safesignal.local");
    await citizen.getByLabel(/What is happening/).fill(description);
    await citizen.getByLabel(/Contact number/).fill("+9779800000000");
    await citizen.getByLabel(/Landmark or location description/).fill("Kitchen block corridor");
    await citizen.getByRole("button", { name: "Submit emergency report" }).click();
    await expect(citizen.getByText(/Emergency report submitted\. Reference: /)).toBeVisible();

    const queueItem = citizen.getByRole("button").filter({ hasText: description });
    await expect(queueItem).toBeVisible();
    await queueItem.click();
    await expect(citizen.getByRole("heading", { name: "Withdraw this report" })).toBeVisible();

    // 2. "Keep report" closes the form without touching the incident.
    await citizen.getByRole("button", { name: "Request cancellation" }).click();
    await citizen.getByLabel("Reason (optional)").fill("Checking with the facility team first.");
    await citizen.getByRole("button", { name: "Keep report" }).click();
    await expect(citizen.getByRole("button", { name: "Request cancellation" })).toBeVisible();
    await expect(citizen.getByText("SUBMITTED").first()).toBeVisible();

    // 3. Confirming the cancellation withdraws the report.
    await citizen.getByRole("button", { name: "Request cancellation" }).click();
    await citizen
      .getByLabel("Reason (optional)")
      .fill("False alarm — the smell came from a cleaning product.");
    await citizen.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(citizen.getByText(/was cancelled\./)).toBeVisible();

    // 4. The detail card, history, and list all reflect the withdrawn state.
    await expect(citizen.getByText("CANCELLED").first()).toBeVisible();
    await expect(
      citizen.getByText("False alarm — the smell came from a cleaning product."),
    ).toBeVisible();
    await expect(queueItem).toContainText("CANCELLED");
    await expect(citizen.getByRole("heading", { name: "Withdraw this report" })).toHaveCount(0);
  } finally {
    await citizenContext.close();
  }
});
