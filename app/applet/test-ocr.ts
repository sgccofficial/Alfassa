import sharp from "sharp";

async function testOcr(filename: string, mimeType: string) {
  console.log(`Testing ${filename} (${mimeType})...`);
  
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).toFormat("png").toBuffer();

  const response = await fetch("http://localhost:3000/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: buffer.toString("base64"),
      mimeType: mimeType,
      fileName: filename
    })
  });

  if (response.ok) {
    console.log(`Success for ${filename}`);
  } else {
    console.log(`Failed for ${filename}: ${response.status} ${await response.text()}`);
  }
}

async function run() {
  await testOcr("test.png", "image/png");
  await testOcr("test.jpg", "image/jpeg");
  await testOcr("test.tiff", "image/tiff");
  await testOcr("test.bmp", "image/bmp");
}

run();
