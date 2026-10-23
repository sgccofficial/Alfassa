import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const fixturesDir = path.resolve("./test-fixtures");
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1x1 png image fixture
const sampleImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const sampleImagePath = path.join(fixturesDir, "sample-chart.png");
if (!fs.existsSync(sampleImagePath)) {
  fs.writeFileSync(sampleImagePath, Buffer.from(sampleImageBase64, "base64"));
}

const sampleDocPath = path.join(fixturesDir, "clinical-notes.txt");
if (!fs.existsSync(sampleDocPath)) {
  fs.writeFileSync(sampleDocPath, "Clinical Posting Schedule Notes:\nDepartment of Obstetrics and Gynaecology\nUnit 1 posting starts Monday.");
}

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type()}]`, msg.text());
  });
  page.on("pageerror", (err) => {
    console.error("[BROWSER ERROR]", err.message);
  });

  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1500);

  // If on login screen, click "Continue as Guest"
  const guestBtn = page.getByRole("button", { name: /continue as guest/i });
  if (await guestBtn.isVisible()) {
    console.log("Clicking 'Continue as Guest'...");
    await guestBtn.click();
    await page.waitForTimeout(1500);
  }

  console.log("Current URL:", page.url());

  async function testUpload(filePath, typeLabel) {
    console.log(`\n================ Testing ${typeLabel}: ${path.basename(filePath)} ================`);
    
    // Hidden file input in Home:
    // docInputRef (index 0), imgInputRef (index 1), videoInputRef (index 2), anyFileInputRef (index 3)
    const fileInputs = await page.$$('input[type="file"]');
    console.log(`Found ${fileInputs.length} file inputs.`);
    if (fileInputs.length === 0) {
      console.error("No file inputs found on page!");
      return;
    }

    // Use the anyFileInput (last) or docInput (first)
    const targetInput = fileInputs[fileInputs.length - 1];
    await targetInput.setInputFiles(filePath);

    console.log("File set. Waiting 6 seconds for processing...");
    await page.waitForTimeout(6000);

    const diagnosis = await page.evaluate(async (fileName) => {
      let materials = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("alfassa_materials_cache")) {
          try {
            const list = JSON.parse(localStorage.getItem(k) || "[]");
            materials.push(...list);
          } catch {}
        }
      }
      const mat = materials.find((m) => m.title === fileName || m.metadata?.originalFileName === fileName);

      let extractions = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("alfassa_extractions_cache")) {
          try {
            const list = JSON.parse(localStorage.getItem(k) || "[]");
            extractions.push(...list);
          } catch {}
        }
      }
      const ext = mat ? extractions.find((e) => e.materialId === mat.id) : null;

      let blobFound = false;
      let blobSize = 0;
      if (mat) {
        try {
          const req = indexedDB.open("alfassa_blobs_db");
          const db = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const tx = db.transaction("blobs", "readonly");
          const store = tx.objectStore("blobs");
          const key = mat.blobStorageKey || mat.id;
          const getReq = store.get(key);
          const record = await new Promise((res, rej) => {
            getReq.onsuccess = () => res(getReq.result);
            getReq.onerror = () => rej(getReq.error);
          });
          if (record) {
            blobFound = true;
            blobSize = record.blob ? record.blob.size : (record.data ? record.data.byteLength : 0);
          }
        } catch (e) {
          console.warn("IDB check error", e);
        }
      }

      return {
        materialFound: !!mat,
        materialId: mat?.id,
        materialProcessingStatus: mat?.processingStatus,
        materialType: mat?.type,
        blobFound,
        blobSize,
        extractionFound: !!ext,
        extractionStatus: ext?.processingStatus,
        pathwayUsed: ext?.pathwayUsed,
        extractedTextLen: ext?.extractedText?.length || 0,
        extractionError: ext?.error,
      };
    }, path.basename(filePath));

    console.log("Diagnosis result:", diagnosis);
  }

  // 1. PDF
  const pdfPath = path.join(fixturesDir, "CAMUS, Albert - The Stranger.pdf");
  if (fs.existsSync(pdfPath)) {
    await testUpload(pdfPath, "PDF");
  }

  // 2. PPTX
  const pptxPath = path.join(fixturesDir, "HELLP Syndrome.pptx");
  if (fs.existsSync(pptxPath)) {
    await testUpload(pptxPath, "PPTX");
  }

  // 3. Image
  await testUpload(sampleImagePath, "Image");

  // 4. Document (TXT)
  await testUpload(sampleDocPath, "Document");

  // Check UI state on Home
  const badges = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("span")).map((s) => s.textContent?.trim()).filter(Boolean);
  });
  console.log("Badges found on Home:", badges.filter(b => ["Ready", "Partial", "Needs attention", "Pending"].includes(b)));

  await browser.close();
}

diagnose().catch(console.error);
