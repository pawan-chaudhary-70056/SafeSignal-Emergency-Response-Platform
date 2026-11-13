import { expect, test } from "@playwright/test";

const PASSWORD = "Password123!";

test("citizen can capture location and use the map picker", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 27.7172, longitude: 85.324 });

  await page.route(/nominatim\.openstreetmap\.org\/search/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          place_id: 1,
          display_name: "Test Hospital, Kathmandu",
          lat: "27.700000",
          lon: "85.300000",
        },
      ]),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel("Email").fill("citizen@safesignal.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Use my current location" }).click();

  await expect(page.getByLabel("Latitude")).toHaveValue("27.717200");
  await expect(page.getByLabel("Longitude")).toHaveValue("85.324000");
  await expect(page.getByRole("status")).toContainText("Location captured");

  // The map picker is the fallback when the device cannot provide a fix.
  await page.getByRole("button", { name: "Pick on map" }).click();
  const picker = page.getByRole("region", { name: "Location picker" });
  await expect(picker).toBeVisible();

  await picker.locator(".leaflet-container").click({ position: { x: 180, y: 120 } });

  await expect(page.getByRole("status")).toContainText("Location set from the map");
  const latitude = Number(await page.getByLabel("Latitude").inputValue());
  const longitude = Number(await page.getByLabel("Longitude").inputValue());

  expect(Number.isFinite(latitude)).toBe(true);
  expect(Number.isFinite(longitude)).toBe(true);
  expect(latitude).toBeGreaterThanOrEqual(-90);
  expect(latitude).toBeLessThanOrEqual(90);
  expect(longitude).toBeGreaterThanOrEqual(-180);
  expect(longitude).toBeLessThanOrEqual(180);

  // Address search provides an exact point without relying on device GPS.
  await picker.getByLabel("Search address or landmark").fill("Test Hospital");
  await picker.getByRole("button", { name: "Search", exact: true }).click();
  await picker.getByRole("button", { name: /Test Hospital, Kathmandu/ }).click();

  await expect(page.getByLabel("Latitude")).toHaveValue("27.700000");
  await expect(page.getByLabel("Longitude")).toHaveValue("85.300000");

  await picker.getByRole("button", { name: "Close map" }).click();
  await expect(picker).toBeHidden();
});
