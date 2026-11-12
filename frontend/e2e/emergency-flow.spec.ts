import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Password123!";
const description = `E2E automated report: person collapsed near the community hospital gate (${Date.now()})`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The socket only connects after the session cookie exists.
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
}

test("citizen reports, dispatcher verifies/assigns, responder resolves, dispatcher closes", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const citizenContext = await browser.newContext();
  const dispatcherContext = await browser.newContext();
  const responderContext = await browser.newContext();

  const citizen = await citizenContext.newPage();
  const dispatcher = await dispatcherContext.newPage();
  const responder = await responderContext.newPage();

  try {
    // 1. Citizen submits an emergency report.
    await signIn(citizen, "citizen@safesignal.local");
    await expect(citizen.getByText("Report an emergency")).toBeVisible();

    await citizen.getByLabel(/What is happening/).fill(description);
    await citizen.getByLabel(/Contact number/).fill("+9779800000000");
    await citizen.getByLabel("Latitude").fill("27.717200");
    await citizen.getByLabel("Longitude").fill("85.324000");
    await citizen
      .getByLabel(/Landmark or location description/)
      .fill("Community hospital main gate");
    await citizen.getByRole("button", { name: "Submit emergency report" }).click();

    const success = citizen.getByText(/Emergency report submitted\. Reference: /);
    await expect(success).toBeVisible();
    const reference = (await success.innerText()).match(/SS-\d{4}-\d{6}/)?.[0];
    expect(reference, "incident reference number").toBeTruthy();

    // The persisted notification reaches the citizen's header bell.
    await citizen.getByRole("button", { name: "Notifications" }).click();
    await expect(citizen.getByText("New emergency report").first()).toBeVisible();
    await citizen.getByRole("button", { name: "Notifications" }).click();

    // 2. Dispatcher reviews, verifies and assigns the demo responder.
    await signIn(dispatcher, "dispatcher@safesignal.local");
    await dispatcher.getByRole("button", { name: "Submitted", exact: true }).click();
    const queueItem = dispatcher.getByRole("button").filter({ hasText: description });
    await expect(queueItem).toBeVisible();
    await queueItem.click();
    await expect(dispatcher.getByText(reference as string).first()).toBeVisible();

    await dispatcher.getByRole("button", { name: "Start review" }).click();
    await expect(dispatcher.getByText("UNDER REVIEW").first()).toBeVisible();

    await dispatcher.getByRole("button", { name: "Verify incident" }).click();
    await expect(dispatcher.getByRole("button", { name: "Assign responder" })).toBeVisible();

    const responderRow = dispatcher
      .getByRole("listitem")
      .filter({ hasText: "responder@safesignal.local" });
    await expect(responderRow).toBeVisible();
    const responderName = (await responderRow.locator("p").first().innerText()).trim();

    const assignSelect = dispatcher.getByLabel(/Assign responder/);
    const optionValue = await assignSelect
      .locator("option", { hasText: responderName })
      .first()
      .getAttribute("value");
    expect(optionValue, "responder option value").toBeTruthy();
    await assignSelect.selectOption(optionValue as string);
    await dispatcher.getByRole("button", { name: "Assign responder" }).click();
    await expect(dispatcher.getByText("Responder assigned. Waiting for acceptance.")).toBeVisible();

    // 3. Responder accepts and walks every response stage.
    await signIn(responder, "responder@safesignal.local");
    const assignmentCard = responder.locator("article").filter({ hasText: description });
    await expect(assignmentCard).toBeVisible();

    await assignmentCard.getByRole("button", { name: "Accept assignment" }).click();
    await assignmentCard.getByRole("button", { name: "Start en route" }).click();
    await assignmentCard.getByRole("button", { name: "Mark arrived" }).click();
    await assignmentCard.getByRole("button", { name: "Assistance in progress" }).click();
    await assignmentCard
      .getByLabel(/Resolution notes/)
      .fill("Casualty handed over to hospital staff.");
    await assignmentCard.getByRole("button", { name: "Mark resolved" }).click();
    await expect(assignmentCard.getByText("Response completed")).toBeVisible();

    // 4. Dispatcher closes the resolved incident.
    await dispatcher.getByRole("button", { name: "Resolved", exact: true }).click();
    const resolvedItem = dispatcher.getByRole("button").filter({ hasText: description });
    await expect(resolvedItem).toBeVisible();
    await resolvedItem.click();
    await dispatcher.getByRole("button", { name: "Review and close incident" }).click();
    await expect(dispatcher.getByText("Incident closed and recorded in history.")).toBeVisible();

    // 5. Citizen sees the closed incident and its full history.
    await citizen.getByRole("button", { name: "Refresh" }).click();
    const citizenItem = citizen.getByRole("button").filter({ hasText: description });
    await expect(citizenItem).toContainText("CLOSED");
    await citizenItem.click();
    await expect(citizen.getByText(/Resolution: Casualty handed over/)).toBeVisible();
  } finally {
    await Promise.all([
      citizenContext.close(),
      dispatcherContext.close(),
      responderContext.close(),
    ]);
  }
});

test("dispatcher reassigns an active assignment and history keeps the reason", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const reassignDescription = `E2E reassign report: gas smell near the school (${Date.now()})`;
  const reason = "Backup unit is needed elsewhere.";

  const citizenContext = await browser.newContext();
  const dispatcherContext = await browser.newContext();
  const newResponderContext = await browser.newContext();

  const citizen = await citizenContext.newPage();
  const dispatcher = await dispatcherContext.newPage();
  const newResponder = await newResponderContext.newPage();

  try {
    await signIn(citizen, "citizen@safesignal.local");
    await citizen.getByLabel(/What is happening/).fill(reassignDescription);
    await citizen.getByRole("button", { name: "Submit emergency report" }).click();
    await expect(citizen.getByText(/Emergency report submitted\. Reference: /)).toBeVisible();

    await signIn(dispatcher, "dispatcher@safesignal.local");
    await dispatcher.getByRole("button", { name: "Submitted", exact: true }).click();
    const queueItem = dispatcher.getByRole("button").filter({ hasText: reassignDescription });
    await expect(queueItem).toBeVisible();
    await queueItem.click();
    await dispatcher.getByRole("button", { name: "Start review" }).click();
    await dispatcher.getByRole("button", { name: "Verify incident" }).click();

    // Assign the backup responder first.
    const backupRow = dispatcher
      .getByRole("listitem")
      .filter({ hasText: "backup@safesignal.local" });
    await expect(backupRow).toBeVisible();
    const backupName = (await backupRow.locator("p").first().innerText()).trim();

    const assignSelect = dispatcher.getByLabel(/Assign responder/);
    const backupValue = await assignSelect
      .locator("option", { hasText: backupName })
      .first()
      .getAttribute("value");
    expect(backupValue, "backup responder option").toBeTruthy();
    await assignSelect.selectOption(backupValue as string);
    await dispatcher.getByRole("button", { name: "Assign responder" }).click();
    await expect(dispatcher.getByText("Responder assigned. Waiting for acceptance.")).toBeVisible();

    // Reassign to the primary responder and record the reason.
    const demoRow = dispatcher
      .getByRole("listitem")
      .filter({ hasText: "responder@safesignal.local" });
    await expect(demoRow).toBeVisible();
    const demoName = (await demoRow.locator("p").first().innerText()).trim();

    const reassignSelect = dispatcher.getByLabel(/Reassign to/);
    const demoValue = await reassignSelect
      .locator("option", { hasText: demoName })
      .first()
      .getAttribute("value");
    expect(demoValue, "replacement responder option").toBeTruthy();
    await reassignSelect.selectOption(demoValue as string);
    await dispatcher.getByLabel(/Reassignment reason/).fill(reason);
    await dispatcher.getByRole("button", { name: "Reassign responder" }).click();
    await expect(
      dispatcher.getByText("Incident reassigned. The new responder can now accept it."),
    ).toBeVisible();

    // The citizen sees the reassignment reason in the stored status history.
    await citizen.getByRole("button", { name: "Refresh" }).click();
    const citizenItem = citizen.getByRole("button").filter({ hasText: reassignDescription });
    await citizenItem.click();
    await expect(citizen.getByText(new RegExp(`Reassigned: ${reason}`))).toBeVisible();

    // The replacement responder receives the pending assignment.
    await signIn(newResponder, "responder@safesignal.local");
    const assignmentCard = newResponder
      .locator("article")
      .filter({ hasText: reassignDescription });
    await expect(assignmentCard).toBeVisible();
    await expect(
      assignmentCard.getByRole("button", { name: "Accept assignment" }),
    ).toBeVisible();
  } finally {
    await Promise.all([
      citizenContext.close(),
      dispatcherContext.close(),
      newResponderContext.close(),
    ]);
  }
});
