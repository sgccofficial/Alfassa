import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const fixturesDir = path.resolve("./test-fixtures");

async function runTests() {
  console.log("=================================================");
  console.log("ALFASSA RELIABLE UPLOAD VISIBILITY & PERSISTENCE TESTS");
  console.log("=================================================\n");

  const browser = await chromium.launch({ 
    headless: true,
    executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell"
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[BROWSER ERROR]", msg.text());
    }
  });

  await page.goto(BASE_URL);
  await page.waitForTimeout(1500);

  // Authenticate as guest if needed
  const guestBtn = page.getByRole("button", { name: /continue as guest/i });
  if (await guestBtn.isVisible()) {
    console.log("Authenticating as guest...");
    await guestBtn.click();
    await page.waitForTimeout(1500);
  }

  // Clear state for clean run
  await page.evaluate(async () => {
    localStorage.clear();
    const req = indexedDB.deleteDatabase("alfassa_blob_store");
    await new Promise((res) => {
      req.onsuccess = res;
      req.onerror = res;
      req.onblocked = res;
    });
  });

  await page.reload();
  await page.waitForTimeout(1500);

  if (await page.getByRole("button", { name: /continue as guest/i }).isVisible()) {
    await page.getByRole("button", { name: /continue as guest/i }).click();
    await page.waitForTimeout(1500);
  }

  const results = [];

  // Helper to get visible materials on page
  async function getVisibleMaterials() {
    return await page.evaluate(() => {
      const items = [];
      const section = Array.from(document.querySelectorAll("section")).find((s) =>
        s.querySelector("h2")?.textContent?.includes("Your Materials")
      );
      if (!section) return [];
      const cards = section.querySelectorAll(".grid > div");
      cards.forEach((c) => {
        const title = c.querySelector("h4")?.textContent?.trim() || "";
        const badge = c.querySelector("span.text-\\[11px\\], span.font-medium")?.textContent?.trim() || "";
        items.push({ title, badge, text: c.textContent?.trim() });
      });
      return items;
    });
  }

  // Helper to get Recent Activity on page
  async function getRecentActivities() {
    return await page.evaluate(() => {
      const activities = [];
      const section = Array.from(document.querySelectorAll("section")).find((s) =>
        s.querySelector("h2")?.textContent?.includes("Recent Activity")
      );
      if (!section) return [];
      const items = section.querySelectorAll(".space-y-2 > div");
      items.forEach((it) => {
        const desc = it.querySelector("p.text-xs")?.textContent?.trim() || "";
        activities.push(desc);
      });
      return activities;
    });
  }

  // TEST 1: Small image intake
  console.log("\n[TEST 1] Small Image Intake (sample-chart.png)...");
  {
    const fileInputs = await page.$$('input[type="file"]');
    const input = fileInputs[fileInputs.length - 1];
    
    // Set file
    const startTime = Date.now();
    await input.setInputFiles(path.join(fixturesDir, "sample-chart.png"));

    // Check immediate visibility
    await page.waitForTimeout(200);
    let visible = await getVisibleMaterials();
    const foundImmediate = visible.some((v) => v.title === "sample-chart.png");
    console.log("  Immediate visibility:", foundImmediate ? "PASS" : "FAIL");

    // Wait for persistence and extraction
    await page.waitForTimeout(4000);
    visible = await getVisibleMaterials();
    const matCard = visible.find((v) => v.title === "sample-chart.png");
    console.log("  Post-intake state:", matCard?.badge || "none");

    const activities = await getRecentActivities();
    const actFound = activities.some((a) => a.includes("sample-chart.png"));
    console.log("  Recent Activity consistent:", actFound ? "PASS" : "FAIL");

    results.push({ test: "Small Image", immediate: foundImmediate, post: !!matCard, activity: actFound });
  }

  // TEST 2: PDF Intake
  console.log("\n[TEST 2] PDF Intake (CAMUS, Albert - The Stranger.pdf)...");
  {
    const fileInputs = await page.$$('input[type="file"]');
    const input = fileInputs[fileInputs.length - 1];
    await input.setInputFiles(path.join(fixturesDir, "CAMUS, Albert - The Stranger.pdf"));

    await page.waitForTimeout(200);
    let visible = await getVisibleMaterials();
    const foundImmediate = visible.some((v) => v.title.includes("CAMUS, Albert"));
    console.log("  Immediate visibility:", foundImmediate ? "PASS" : "FAIL");

    await page.waitForTimeout(5000);
    visible = await getVisibleMaterials();
    const matCard = visible.find((v) => v.title.includes("CAMUS, Albert"));
    console.log("  Post-intake state:", matCard?.badge || "none");

    results.push({ test: "PDF", immediate: foundImmediate, post: !!matCard });
  }

  // TEST 3: Video Intake (1000245537.mp4)
  console.log("\n[TEST 3] Video Intake (1000245537.mp4)...");
  {
    const fileInputs = await page.$$('input[type="file"]');
    const input = fileInputs[fileInputs.length - 1];
    await input.setInputFiles(path.join(fixturesDir, "1000245537.mp4"));

    await page.waitForTimeout(200);
    let visible = await getVisibleMaterials();
    const foundImmediate = visible.some((v) => v.title === "1000245537.mp4");
    console.log("  Immediate visibility:", foundImmediate ? "PASS" : "FAIL");

    // Wait for persistence
    await page.waitForTimeout(4000);
    visible = await getVisibleMaterials();
    const matCard = visible.find((v) => v.title === "1000245537.mp4");
    console.log("  Post-intake status:", matCard?.badge || "none");

    const count = visible.filter((v) => v.title === "1000245537.mp4").length;
    console.log("  No duplicates (count === 1):", count === 1 ? "PASS" : `FAIL (${count})`);

    results.push({ test: "Video Intake", immediate: foundImmediate, post: !!matCard, noDuplicates: count === 1 });
  }

  // TEST 4: Audio file intake (voice-note.webm)
  console.log("\n[TEST 4] Audio Intake (voice-note.webm)...");
  {
    const fileInputs = await page.$$('input[type="file"]');
    const input = fileInputs[fileInputs.length - 1];
    await input.setInputFiles(path.join(fixturesDir, "voice-note.webm"));

    await page.waitForTimeout(200);
    let visible = await getVisibleMaterials();
    const foundImmediate = visible.some((v) => v.title === "voice-note.webm");
    console.log("  Immediate visibility:", foundImmediate ? "PASS" : "FAIL");

    await page.waitForTimeout(4000);
    visible = await getVisibleMaterials();
    const matCard = visible.find((v) => v.title === "voice-note.webm");
    console.log("  Post-intake status:", matCard?.badge || "none");

    const activities = await getRecentActivities();
    const actFound = activities.some((a) => a.includes("voice-note.webm"));
    console.log("  Recent Activity consistent:", actFound ? "PASS" : "FAIL");

    results.push({ test: "Audio Intake", immediate: foundImmediate, post: !!matCard, activity: actFound });
  }

  // TEST 5: Web Link intake
  console.log("\n[TEST 5] Web Link Intake...");
  {
    const linkBtn = page.getByRole("button", { name: "Link" }).or(page.getByTitle("Bring Web Link"));
    await linkBtn.click();
    await page.waitForTimeout(500);

    const urlInput = page.getByPlaceholder("https://example.com/article");
    await urlInput.fill("https://example.com");
    const submitBtn = page.getByRole("button", { name: /add link/i });
    await submitBtn.click();

    await page.waitForTimeout(2500);
    const visible = await getVisibleMaterials();
    const foundLink = visible.some((v) => v.title.includes("example.com") || v.text.includes("link"));
    console.log("  Link visible in Your Materials:", foundLink ? "PASS" : "FAIL");

    results.push({ test: "Web Link", success: foundLink });
  }

  // TEST 6: Two files selected in quick succession
  console.log("\n[TEST 6] Two Files in Quick Succession...");
  {
    const fileInputs = await page.$$('input[type="file"]');
    const input = fileInputs[fileInputs.length - 1];

    await input.setInputFiles([
      path.join(fixturesDir, "schedule-chart.png"),
      path.join(fixturesDir, "clinical-notes.txt"),
    ]);

    // Check immediate visibility of both
    await page.waitForTimeout(300);
    let visible = await getVisibleMaterials();
    const chartFound = visible.some((v) => v.title === "schedule-chart.png");
    const notesFound = visible.some((v) => v.title === "clinical-notes.txt");
    console.log("  Both appear immediately:", chartFound && notesFound ? "PASS" : `FAIL (chart: ${chartFound}, notes: ${notesFound})`);

    await page.waitForTimeout(5000);
    visible = await getVisibleMaterials();
    const chartCount = visible.filter((v) => v.title === "schedule-chart.png").length;
    const notesCount = visible.filter((v) => v.title === "clinical-notes.txt").length;
    console.log("  No duplicates for multi-file:", chartCount === 1 && notesCount === 1 ? "PASS" : "FAIL");

    results.push({ test: "Quick Succession", immediate: chartFound && notesFound, noDuplicates: chartCount === 1 && notesCount === 1 });
  }

  // TEST 7: Page Refresh & Persistence Survival
  console.log("\n[TEST 7] Page Refresh & Persistence Recovery...");
  {
    const beforeMaterials = await getVisibleMaterials();
    console.log(`  Items before refresh: ${beforeMaterials.length}`);

    await page.reload();
    await page.waitForTimeout(2000);

    if (await page.getByRole("button", { name: /continue as guest/i }).isVisible()) {
      await page.getByRole("button", { name: /continue as guest/i }).click();
      await page.waitForTimeout(1500);
    }

    const afterMaterials = await getVisibleMaterials();
    console.log(`  Items after refresh: ${afterMaterials.length}`);
    const survived = afterMaterials.length >= beforeMaterials.length;
    console.log("  Persistence survives refresh:", survived ? "PASS" : "FAIL");

    results.push({ test: "Persistence Refresh", survived });
  }

  // TEST 8: Open in Canvas / Detail Viewer
  console.log("\n[TEST 8] Open Original in Material Detail / Canvas...");
  {
    const cards = await page.$$('.grid > div');
    if (cards.length > 0) {
      await cards[0].click();
      await page.waitForTimeout(1500);
      const url = page.url();
      const inViewer = url.includes("/material/");
      console.log(`  Navigated to material viewer (${url}):`, inViewer ? "PASS" : "FAIL");

      // Verify header/title loaded
      const pageTitle = await page.title();
      console.log("  Viewer page title:", pageTitle);

      // Back to home
      await page.goto(BASE_URL);
      await page.waitForTimeout(1500);
      results.push({ test: "Open Detail View", pass: inViewer });
    }
  }

  // TEST 9: Failed Extraction Does Not Hide Original & Allows Retry
  console.log("\n[TEST 9] Failed Extraction Preservation & Retry...");
  {
    // Inject a material with failed extraction into local DB
    const testResult = await page.evaluate(async () => {
      let materials = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("alfassa_materials_cache")) {
          try {
            materials = JSON.parse(localStorage.getItem(k) || "[]");
            break;
          } catch {}
        }
      }
      if (materials.length > 0) {
        // Mark one as extraction failed
        materials[0].processingStatus = "failed";
        materials[0].errorDetail = {
          stage: "extraction",
          message: "Transcription server error (503)",
          timestamp: new Date().toISOString(),
        };
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("alfassa_materials_cache")) {
            localStorage.setItem(k, JSON.stringify(materials));
          }
        }
        return { modifiedId: materials[0].id, title: materials[0].title };
      }
      return null;
    });

    await page.reload();
    await page.waitForTimeout(2000);

    const visible = await getVisibleMaterials();
    const failedItem = visible.find((v) => v.badge.includes("Needs attention"));
    console.log("  Failed material remains visible with 'Needs attention':", !!failedItem ? "PASS" : "FAIL");

    const hasRetry = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Retry"));
      return !!btn;
    });
    console.log("  Retry button displayed for failed extraction:", hasRetry ? "PASS" : "FAIL");

    results.push({ test: "Failed Extraction Intact", visible: !!failedItem, hasRetry });
  }

  console.log("\n=================================================");
  console.log("ALL TESTS COMPLETED");
  console.log(JSON.stringify(results, null, 2));
  console.log("=================================================");

  await browser.close();
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
