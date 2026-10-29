import { expect, test } from "@playwright/test";
import { installMockTauri } from "./mock-tauri";

test.beforeEach(async ({ page }) => {
  await installMockTauri(page);
  await page.goto("/");
});

test("renders the local knowledge-base shell", async ({ page }) => {
  await expect(page.getByText("Local knowledge base")).toBeVisible();
  await expect(page.getByRole("heading", { name: "UnrealNotes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All notes" })).toBeVisible();
  await expect(page.getByText("No open notes")).toBeVisible();
  await expect(page.getByText("Outline-first writing")).toBeVisible();
});

test("creates a note and persists edits through autosave", async ({ page }) => {
  await page.keyboard.press("Control+n");

  const title = page.getByLabel("Note title", { exact: true });
  await expect(title).toHaveValue("Untitled note");
  await title.fill("Material notes");

  const editor = page.locator(".prose-editor");
  await editor.click();
  await page.keyboard.type("Base colour drives the look.");

  await expect(page.locator("footer")).toContainText("Saved", { timeout: 10_000 });
  expect(
    await page.evaluate(
      () => (window as unknown as { __mockSaves?: number }).__mockSaves ?? 0,
    ),
  ).toBeGreaterThan(0);

  // The tab strip and the note list both follow the saved title.
  await expect(
    page.getByRole("button", { name: "Material notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Material notes" })).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: /^Material notes$/ })).toBeVisible();
});

test("builds an outline from headings and folds a section", async ({ page }) => {
  await page.keyboard.press("Control+n");

  const editor = page.locator(".prose-editor");
  await editor.click();
  await page.keyboard.type("# Materials");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Base colour");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Base colour drives the look.");

  const outline = page.getByRole("complementary", { name: "Outline" });
  await expect(outline.getByRole("button", { name: "Materials", exact: true })).toBeVisible();
  await expect(outline.getByRole("button", { name: "Base colour", exact: true })).toBeVisible();

  // The parent heading owns a fold chevron; folding flips the outline state.
  const fold = outline.getByRole("button", { name: "Fold section" });
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await fold.click();
  await expect(outline.getByRole("button", { name: "Unfold section" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("moves a note to trash and restores it", async ({ page }) => {
  await page.keyboard.press("Control+n");
  const title = page.getByLabel("Note title", { exact: true });
  await title.fill("Scrap note");
  await page.locator(".prose-editor").click();
  await page.keyboard.type("Temporary idea.");
  await expect(page.locator("footer")).toContainText("Saved", { timeout: 10_000 });

  await page.getByRole("button", { name: "Actions for Scrap note" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page.getByRole("button", { name: "Move to trash" }).click();

  await page.getByRole("button", { name: "Trash" }).click();
  await expect(page.getByText("Trash", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();
});

test("searches from the keyboard and reports empty results", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const search = page.getByLabel("Search query");
  await expect(search).toBeFocused();
  await search.fill("materials");
  await expect(page.getByText("No notes match", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
});

test("cycles and remembers the theme", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Change theme" }).click();
  await expect(html).not.toHaveClass(/dark/);

  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
});

test("opens settings and reads the local data locations", async ({ page }) => {
  await page.keyboard.press("Control+,");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Settings", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: /Data & backups/ }).click();
  await expect(dialog.getByRole("heading", { name: "Backups" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export backup" })).toBeVisible();

  await dialog.getByRole("button", { name: "About" }).click();
  await expect(dialog.getByText("C:/mock/unrealnotes.db")).toBeVisible();
});

test("opens the command palette with the keyboard", async ({ page }) => {
  await page.keyboard.press("Control+Shift+P");
  const input = page.getByRole("textbox", { name: "Command", exact: true });
  await expect(input).toBeFocused();
  await input.fill("settings");
  await expect(page.getByRole("option", { name: /Open settings/ })).toBeVisible();
});
