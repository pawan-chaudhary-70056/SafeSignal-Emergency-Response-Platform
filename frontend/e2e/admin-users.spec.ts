import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Password123!";
const stamp = Date.now();
const createdName = `E2E Created Citizen ${stamp}`;
const createdEmail = `e2e-created-${stamp}@safesignal.local`;
const updatedName = `E2E Edited Citizen ${stamp}`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function findUserRow(page: Page, text: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const row = page.getByRole("row").filter({ hasText: text });
    if ((await row.count()) > 0) {
      return row.first();
    }

    const next = page.getByRole("button", { name: "Next" });
    if (!(await next.isEnabled())) {
      break;
    }

    const loaded = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/users?") &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    await next.click();
    await loaded;
  }

  return page.getByRole("row").filter({ hasText: text }).first();
}

test("admin creates a user and corrects their profile inline", async ({ page }) => {
  test.setTimeout(180_000);

  await signIn(page, "admin@safesignal.local");

  const createForm = page.getByRole("form", { name: "Add user form" });
  await expect(createForm).toBeVisible();

  await createForm.getByLabel("Full name").fill(createdName);
  await createForm.getByLabel("Email").fill(createdEmail);
  await createForm.getByLabel("Temporary password").fill(PASSWORD);
  await createForm.getByLabel("Phone number (optional)").fill("+9779800011122");
  await createForm.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(`Account created for ${createdName}.`)).toBeVisible();

  // Filter to citizens and page through to the newly created account.
  await page.getByRole("button", { name: "Citizens", exact: true }).click();
  await expect(page.getByRole("button", { name: "Citizens", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const createdRow = await findUserRow(page, createdName);
  await expect(createdRow).toBeVisible();
  await expect(createdRow).toContainText(createdEmail);

  // Inline profile edit: display name and phone are the permitted fields.
  await page.getByRole("button", { name: `Edit profile for ${createdName}` }).click();
  const editForm = page.getByRole("form", { name: `Edit profile for ${createdName}` });
  await expect(editForm).toBeVisible();
  await editForm.getByLabel("Full name").fill(updatedName);
  await editForm.getByLabel("Phone number").fill("+9779800033344");
  await editForm.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(`${updatedName}'s profile updated.`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: updatedName }).first()).toContainText(
    "+9779800033344",
  );

  // The correction is recorded in the audit trail.
  await page.getByLabel("Filter audit log by action").fill("admin.user_profile_updated");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("cell", { name: "admin.user_profile_updated" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Demo Administrator").first()).toBeVisible();
});
