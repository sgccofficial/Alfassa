import { Material, MaterialExtraction, ExtractedWebResult } from "../../../types";

/**
 * Web Link Extraction Pathway
 * 
 * Extracts readable content and metadata from web links while ALWAYS
 * preserving the original URL untouched.
 * Respects browser security boundaries without creating fake or simulated content.
 */
export async function processWebPathway(
  material: Material
): Promise<Partial<MaterialExtraction>> {
  const originalUrl = material.originalInput.url || material.title;

  try {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(originalUrl);
    } catch {
      return {
        processingStatus: "failed",
        pathwayUsed: "web_extractor",
        error: {
          code: "INVALID_URL_FORMAT",
          message: `The provided URL '${originalUrl}' is not a valid web URL.`,
          timestamp: new Date().toISOString(),
        }
      };
    }

    const domain = parsedUrl.hostname;
    const now = new Date().toISOString();

    // Attempt direct client-side fetch (with timeout to prevent hanging)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      // Use backend proxy to bypass CORS and access server-side HTML
      const response = await fetch("/api/fetch-web-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          processingStatus: "failed",
          pathwayUsed: "web_extractor",
          webResult: {
            canonicalUrl: originalUrl,
            domain,
            extractedAt: now,
            fetchStatus: "failed",
          },
          error: {
            code: "HTTP_ERROR",
            message: `Remote server responded with HTTP status ${response.status}.`,
            timestamp: now,
          },
          completedAt: now,
        };
      }

      const data = await response.json();
      const rawHtml = data.text || "";
      const contentType = data.contentType || "";
      const backendTitle = data.title;
      const backendDescription = data.description;

      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, "text/html");

      const pageTitle = backendTitle || 
                        doc.querySelector("title")?.textContent?.trim() || 
                        doc.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
                        domain;

      const metaDescription = backendDescription || 
                              doc.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
                              doc.querySelector("meta[property='og:description']")?.getAttribute("content")?.trim();

      // Main article container or body
      const contentRoot = doc.querySelector("main, article, #content, .content, .mw-parser-output") || doc.body;

      // Strip non-content elements
      contentRoot?.querySelectorAll("script, style, nav, footer, header, noscript, svg, iframe, form, button, .sidebar, .nav").forEach((el) => el.remove());

      const blocks: string[] = [];
      if (pageTitle && !pageTitle.startsWith("http")) {
        blocks.push(`# ${pageTitle}\n`);
      }
      if (metaDescription) {
        blocks.push(`> ${metaDescription}\n`);
      }

      // Collect structured paragraphs and headings
      contentRoot?.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach((el) => {
        const text = el.textContent?.trim();
        if (!text) return;
        const tag = el.tagName.toLowerCase();
        if (tag === "h1") blocks.push(`\n# ${text}\n`);
        else if (tag === "h2") blocks.push(`\n## ${text}\n`);
        else if (tag === "h3") blocks.push(`\n### ${text}\n`);
        else if (tag === "h4") blocks.push(`\n#### ${text}\n`);
        else if (tag === "li") blocks.push(`• ${text}`);
        else if (tag === "blockquote") blocks.push(`> ${text}\n`);
        else blocks.push(`${text}\n`);
      });

      let structuredText = blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();

      // Fallback if no structured blocks found (e.g. plain text or unusual markup)
      if (!structuredText || structuredText.length < 50) {
        const fallbackText = contentRoot?.textContent?.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim() || "";
        if (fallbackText.length > 50) {
          structuredText = (pageTitle ? `# ${pageTitle}\n\n` : "") + fallbackText;
        } else {
          // Minimal readable representation for single-page apps or metadata-only sites
          structuredText = `# ${pageTitle}\n\n${metaDescription ? `> ${metaDescription}\n\n` : ""}Source URL: ${originalUrl}\nDomain: ${domain}\n\nWebsite preserved in your workspace.`;
        }
      }

      const webResult: ExtractedWebResult = {
        canonicalUrl: originalUrl,
        domain,
        pageTitle: pageTitle || undefined,
        metaDescription: metaDescription || undefined,
        pageText: structuredText.slice(0, 10000), // retain readable body
        extractedAt: now,
        contentType,
        fetchStatus: "retrieved",
      };

      return {
        processingStatus: "completed",
        pathwayUsed: "web_extractor",
        extractedText: structuredText,
        webResult,
        completedAt: now,
      };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);

      return {
        processingStatus: "failed",
        pathwayUsed: "web_extractor",
        webResult: {
          canonicalUrl: originalUrl,
          domain,
          extractedAt: now,
          fetchStatus: "failed",
        },
        error: {
          code: "NETWORK_ERROR",
          message: fetchErr instanceof Error ? fetchErr.message : "Failed to retrieve webpage content.",
          timestamp: now,
        },
        completedAt: now,
      };
    }
  } catch (error) {
    return {
      processingStatus: "failed",
      pathwayUsed: "web_extractor",
      error: {
        code: "WEB_EXTRACTION_EXCEPTION",
        message: error instanceof Error ? error.message : "Web link extraction failed.",
        timestamp: new Date().toISOString(),
      }
    };
  }
}
