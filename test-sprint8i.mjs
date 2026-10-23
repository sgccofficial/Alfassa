import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const fixturesDir = path.resolve("./test-fixtures");

async function run() {
  console.log("=== SPRINT 8I E2E TESTS START ===");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[BROWSER ${msg.type()}]`, msg.text());
    }
  });

  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  // Authenticate as guest if needed
  const guestBtn = page.getByRole("button", { name: /continue as guest/i });
  if (await guestBtn.isVisible()) {
    console.log("Signing in as guest...");
    await guestBtn.click();
    await page.waitForTimeout(2000);
  }

  // Clear any previous materials in localStorage and IDB for clean test run
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

  // Check guest status again if reload required it
  if (await page.getByRole("button", { name: /continue as guest/i }).isVisible()) {
    await page.getByRole("button", { name: /continue as guest/i }).click();
    await page.waitForTimeout(1500);
  }

  const results = {};

  async function testMaterialIntake(fileName, formatLabel) {
    console.log(`\n--- Testing ${formatLabel}: ${fileName} ---`);
    const filePath = path.join(fixturesDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture not found: ${filePath}`);
    }

    // Use hidden universal file input
    const inputs = await page.$$('input[type="file"]');
    const input = inputs[inputs.length - 1]; // anyFileInputRef
    await input.setInputFiles(filePath);

    // Give asynchronous extraction pipeline time to execute
    console.log("Waiting for processing pipeline to complete...");
    await page.waitForTimeout(7000);

    // Retrieve state from browser
    const state = await page.evaluate(async (targetFileName) => {
      let materials = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("alfassa_materials_cache")) {
          try {
            materials.push(...JSON.parse(localStorage.getItem(k) || "[]"));
          } catch {}
        }
      }
      const mat = materials.find((m) => m.title === targetFileName || m.metadata?.originalFileName === targetFileName);

      let extractions = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("alfassa_extractions_cache")) {
          try {
            extractions.push(...JSON.parse(localStorage.getItem(k) || "[]"));
          } catch {}
        }
      }
      const ext = mat ? extractions.find((e) => e.materialId === mat.id) : null;

      // Check IndexedDB
      let idbFound = false;
      let idbSize = 0;
      if (mat) {
        try {
          const req = indexedDB.open("alfassa_blob_store");
          const db = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const tx = db.transaction("materials_binary", "readonly");
          const store = tx.objectStore("materials_binary");
          const rec = await new Promise((res, rej) => {
            const r = store.get(mat.id);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          if (rec && rec.blob) {
            idbFound = true;
            idbSize = rec.blob.size;
          }
        } catch (e) {
          console.warn("IDB error:", e);
        }
      }

      return {
        materialCreated: !!mat,
        materialId: mat?.id,
        materialStatus: mat?.processingStatus,
        idbFound,
        idbSize,
        extractionSaved: !!ext,
        extractionStatus: ext?.processingStatus,
        pathwayUsed: ext?.pathwayUsed,
        textLength: ext?.extractedText?.length || 0,
        textSample: ext?.extractedText?.slice(0, 100) || "",
        error: ext?.error,
      };
    }, fileName);

    console.log("Result for " + formatLabel + ":", state);
    results[formatLabel] = state;
    return state;
  }

  // 1. PDF
  await testMaterialIntake("CAMUS, Albert - The Stranger.pdf", "PDF");

  // 2. PPTX
  await testMaterialIntake("HELLP Syndrome.pptx", "PPTX");

  // 3. Image
  await testMaterialIntake("schedule-chart.png", "Image");

  // 4. Document
  await testMaterialIntake("clinical-notes.txt", "Document");

  // Check UI badges on Home
  const uiBadges = await page.evaluate(() => {
    const badges = [];
    document.querySelectorAll("span").forEach((s) => {
      const text = s.textContent?.trim();
      if (["Ready", "Partial", "Needs attention", "Pending"].includes(text)) {
        badges.push(text);
      }
    });
    return badges;
  });
  console.log("\nHome screen status badges:", uiBadges);

  // Check reload persistence
  console.log("\nReloading page to test persistence...");
  await page.reload();
  await page.waitForTimeout(2000);

  const reloadedBadges = await page.evaluate(() => {
    const badges = [];
    document.querySelectorAll("span").forEach((s) => {
      const text = s.textContent?.trim();
      if (["Ready", "Partial", "Needs attention", "Pending"].includes(text)) {
        badges.push(text);
      }
    });
    return badges;
  });
  console.log("Home screen status badges after reload:", reloadedBadges);

  // Check if any "Needs attention" exist
  const hasNeedsAttention = reloadedBadges.includes("Needs attention");
  console.log(`Contains 'Needs attention': ${hasNeedsAttention}`);

  await browser.close();

  console.log("\n=== SUMMARY ===");
  console.log("PDF extraction:", results.PDF?.extractionStatus, "text length:", results.PDF?.textLength);
  console.log("PPTX extraction:", results.PPTX?.extractionStatus, "text length:", results.PPTX?.textLength);
  console.log("Image OCR:", results.Image?.extractionStatus, "text length:", results.Image?.textLength);
  console.log("Document extraction:", results.Document?.extractionStatus, "text length:", results.Document?.textLength);
  console.log("Needs attention eliminated:", !hasNeedsAttention);
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
