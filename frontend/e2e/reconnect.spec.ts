import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

const PASSWORD = "Password123!";
const description = `E2E reconnect report: smoke in the archive room (${Date.now()})`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("citizen refreshes state over REST after the socket reconnects", async ({ browser }) => {
  test.setTimeout(180_000);

  const citizenContext = await browser.newContext();
  const dispatcherContext = await browser.newContext();
  const citizen = await citizenContext.newPage();
  const dispatcher = await dispatcherContext.newPage();

  const sockets: WebSocketRoute[] = [];
  let allowReconnect = true;

  // Block both transports while the socket is down: polling goes through the
  // HTTP route and the upgrade through the WebSocket route. Otherwise the
  // client would reconnect over polling immediately.
  await citizen.route(/\/socket\.io\//, (route) =>
    allowReconnect ? route.continue() : route.abort(),
  );
  await citizen.routeWebSocket(/socket\.io/, (socket) => {
    if (!allowReconnect) {
      void socket.close();
      return;
    }

    sockets.push(socket);
    socket.connectToServer();
  });

  try {
    await signIn(citizen, "citizen@safesignal.local");
    await citizen.getByLabel(/What is happening/).fill(description);
    await citizen.getByLabel(/Contact number/).fill("+9779800000000");
    await citizen
      .getByLabel(/Landmark or location description/)
      .fill("Archive room, second floor");
    await citizen.getByRole("button", { name: "Submit emergency report" }).click();
    await expect(citizen.getByText(/Emergency report submitted\. Reference: /)).toBeVisible();
    await expect.poll(() => sockets.length).toBeGreaterThan(0);

    // Drop the socket and keep it down while dispatch advances the incident.
    allowReconnect = false;
    await sockets.at(-1)?.close();
    await expect(citizen.getByText("Offline", { exact: true }).first()).toBeVisible();

    await signIn(dispatcher, "dispatcher@safesignal.local");
    await dispatcher.getByRole("button", { name: "Submitted", exact: true }).click();
    const queueItem = dispatcher.getByRole("button").filter({ hasText: description });
    await expect(queueItem).toBeVisible();
    await queueItem.click();
    await dispatcher.getByRole("button", { name: "Start review" }).click();
    await expect(dispatcher.getByText("UNDER REVIEW").first()).toBeVisible();

    // The citizen still shows the stale status until the socket returns.
    const citizenItem = citizen.getByRole("button").filter({ hasText: description });
    await expect(citizenItem).toContainText("SUBMITTED");

    allowReconnect = true;
    await expect(citizen.getByText("Live", { exact: true }).first()).toBeVisible({
      timeout: 40_000,
    });
    await expect(
      citizen.getByText("Reconnected — refreshed the latest data"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(citizenItem).toContainText("UNDER REVIEW");
  } finally {
    allowReconnect = true;
    await Promise.all([citizenContext.close(), dispatcherContext.close()]);
  }
});
