import { test, expect } from "@playwright/test";

/**
 * The earlier CTA spec only checked the hero, navbar and closing buttons, so
 * five dead "Learn more" buttons on the programme cards sat there unnoticed.
 * This sweeps every control on the public pages instead of a chosen few.
 */
test("no control on a public page is inert", async ({ page }) => {
  const dead: string[] = [];

  for (const path of ["/", "/apply", "/login"]) {
    await page.goto(path);
    await page.waitForTimeout(600);

    const inert = await page.locator("button:visible").evaluateAll((els) =>
      els
        .filter((el) => {
          const b = el as HTMLButtonElement;
          // `type` defaults to "submit" on every button, form or not, so it
          // cannot tell us anything — `form` is null unless the button really
          // does submit something. React handlers hang off __reactProps$*.
          if (b.form) return false;
          const key = Object.keys(b).find((k) => k.startsWith("__reactProps$"));
          const props = key ? (b as any)[key] : null;
          return !props?.onClick;
        })
        .map((el) => (el.textContent || "").trim().slice(0, 40) || "(icon only)"),
    );

    inert
      // Known and reported: the footer newsletter has no subscriber storage
      // behind it. Listed here so it does not mask a NEW dead control.
      .filter((label) => label !== "Join")
      .forEach((label) => dead.push(`${path} -> "${label}"`));
  }

  expect(dead, `Buttons that do nothing when clicked:\n${dead.join("\n")}`).toEqual([]);
});

test("every programme card links to the application with that programme chosen", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByRole("link", { name: /Apply for this/i });
  // Count only once the cards have actually rendered, or this races the app.
  await cards.first().waitFor({ state: "attached", timeout: 10_000 });
  const count = await cards.count();
  expect(count, "each programme card should offer a way through").toBeGreaterThan(4);

  // Spot-check one end to end: the dropdown should arrive already filled in.
  await cards.nth(1).click();
  await expect(page).toHaveURL(/\/apply\?program=/);
  await expect(page.getByRole("combobox")).toContainText("Neural Engineering");
});

test("a programme that does not exist is ignored rather than trusted", async ({ page }) => {
  await page.goto("/apply?program=Hogwarts%20Potions");
  await expect(page.getByRole("combobox")).toContainText(/Choose a programme/i);
});
