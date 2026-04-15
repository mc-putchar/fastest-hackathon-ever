import type { Task } from "@/app/lib/domain";

export interface LiveAppointmentMatch {
  providerName: string;
  providerType?: string;
  address?: string;
  availabilityLabel?: string;
  href: string;
  source: string;
}

export interface LiveSearchOutcome {
  providerKey: string;
  providerLabel: string;
  searchUrl: string;
  matches: LiveAppointmentMatch[];
  screenshotHref?: string;
  fallbackReason?: "playwright_unavailable" | "site_changed";
  detail?: string;
}

declare global {
  var __dreamAgentLiveAppointmentSearch:
    | ((task: Pick<Task, "id" | "goal" | "executionTarget" | "input">) => Promise<LiveSearchOutcome>)
    | undefined;
}

const specialtySlugMap: Record<string, string> = {
  Cardiology: "kardiologie",
  Dermatology: "hautarzt",
  "General practice": "allgemeinmedizin",
};

const skippedLinkLabels = new Set([
  "Doctolib",
  "Hilfe",
  "Hilfebereich aufrufen",
  "Karte anzeigen",
  "Vorherige Seite",
  "Nächste Seite",
]);

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function doctolibSpecialtySlug(task: Pick<Task, "input">) {
  if (task.input.appointmentKind === "dentist") {
    return "zahnmedizin";
  }

  if (task.input.specialty && specialtySlugMap[task.input.specialty]) {
    return specialtySlugMap[task.input.specialty];
  }

  return slugify(task.input.specialty ?? "arzt");
}

export function buildDoctolibSearchUrl(task: Pick<Task, "input">) {
  const specialtySlug = doctolibSpecialtySlug(task);
  const citySlug = slugify(task.input.city ?? "Berlin");
  const url = new URL(`https://www.doctolib.de/${specialtySlug}/${citySlug}`);

  // Public-insurance searches expose a stable filter parameter in Doctolib URLs.
  if (task.input.insuranceType === "public") {
    url.searchParams.set("insurance_sector", "public");
  }

  return url.toString();
}

function isDayLabel(line: string) {
  return /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Heute|Today)\b/i.test(
    line,
  );
}

function isTimeLabel(line: string) {
  return /^\d{1,2}:\d{2}$/.test(line);
}

function isDistanceLine(line: string) {
  return /^\d+[,.]?\d*\s?km$/i.test(line);
}

function isInsuranceLine(line: string) {
  return /(gesetzlich|privat|selbstzahl)/i.test(line);
}

function isAvailabilityInfo(line: string) {
  return /^(Weitere Termine anzeigen|Verfügbarkeiten ab|Nächster Termin|Diese:r Ärzt:in|Wir geben stufenweise)/i.test(
    line,
  );
}

function isStopLine(line: string) {
  return /^(Vorherige Seite|Nächste Seite|Karte anzeigen)$/i.test(line);
}

function extractAvailabilityLabel(block: string[]) {
  let currentDay: string | null = null;

  for (const line of block.slice(1)) {
    if (isDayLabel(line)) {
      currentDay = line;
      continue;
    }

    if (isTimeLabel(line)) {
      return currentDay ? `${currentDay} ${line}` : line;
    }

    if (/^(Verfügbarkeiten ab|Nächster Termin)/i.test(line)) {
      return line;
    }
  }

  return undefined;
}

function extractProviderType(block: string[]) {
  for (const line of block.slice(1)) {
    if (isDistanceLine(line) || isInsuranceLine(line) || isAvailabilityInfo(line) || isDayLabel(line) || isTimeLabel(line)) {
      continue;
    }

    if (/\d/.test(line)) {
      continue;
    }

    return line;
  }

  return undefined;
}

function extractAddress(block: string[], providerType: string | undefined) {
  const metadata = block.slice(1);
  const startIndex = providerType ? metadata.indexOf(providerType) + 1 : 0;
  const addressLines: string[] = [];

  for (const line of metadata.slice(Math.max(startIndex, 0))) {
    if (isDistanceLine(line) || isInsuranceLine(line) || isAvailabilityInfo(line) || isDayLabel(line) || isTimeLabel(line)) {
      break;
    }

    if (!/\d/.test(line) && addressLines.length > 0) {
      break;
    }

    if (line === providerType) {
      continue;
    }

    addressLines.push(line);
    if (addressLines.length === 2) {
      break;
    }
  }

  return addressLines.length > 0 ? addressLines.join(", ") : undefined;
}

function dedupeLinks(links: Array<{ text: string; href: string }>) {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.text}::${link.href}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractMatches(
  text: string,
  links: Array<{ text: string; href: string }>,
  searchUrl: string,
): LiveAppointmentMatch[] {
  const searchPath = new URL(searchUrl).pathname;
  const providerLinks = dedupeLinks(
    links.filter((link) => !skippedLinkLabels.has(link.text) && new URL(link.href).pathname.startsWith(`${searchPath}/`)),
  );
  const providerNames = new Set(providerLinks.map((link) => link.text));
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: string[][] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    if (!providerNames.has(lines[cursor])) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    cursor += 1;

    while (cursor < lines.length && !providerNames.has(lines[cursor]) && !isStopLine(lines[cursor])) {
      cursor += 1;
    }

    blocks.push(lines.slice(start, cursor));
  }

  const matches: LiveAppointmentMatch[] = [];

  for (const block of blocks) {
    const providerName = block[0];
    const href = providerLinks.find((link) => link.text === providerName)?.href;
    if (!href) {
      continue;
    }

    const providerType = extractProviderType(block);
    const address = extractAddress(block, providerType);
    const availabilityLabel = extractAvailabilityLabel(block);

    matches.push({
      providerName,
      providerType,
      address,
      availabilityLabel,
      href,
      source: "Doctolib",
    });

    if (matches.length === 3) {
      break;
    }
  }

  return matches;
}

function looksLikeNoResults(text: string) {
  return /(0 Ergebnisse|keine ergebnisse|keine freien termine|keine online-termine)/i.test(text);
}

function classifyFallbackReason(error: unknown): LiveSearchOutcome["fallbackReason"] {
  if (
    error instanceof Error &&
    /(playwright|browserType\.launch|Executable doesn't exist|Failed to launch)/i.test(error.message)
  ) {
    return "playwright_unavailable";
  }

  return "site_changed";
}

async function searchDoctolib(task: Pick<Task, "id" | "goal" | "executionTarget" | "input">): Promise<LiveSearchOutcome> {
  const searchUrl = buildDoctolibSearchUrl(task);

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        locale: task.input.language === "de" ? "de-DE" : "en-DE",
        timezoneId: "Europe/Berlin",
      });
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(800);

      const root = page.locator("main");
      const text = ((await root.count()) > 0 ? await root.innerText() : await page.locator("body").innerText()).trim();
      const links = await page.locator("a[href]").evaluateAll((anchors, searchPath) =>
        anchors
          .map((anchor) => {
            const element = anchor as HTMLElement;
            const rawLabel = (element.innerText ?? anchor.textContent ?? "")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)[0];
            const href = anchor.getAttribute("href");

            if (!rawLabel || !href) {
              return null;
            }

            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin || url.pathname === searchPath || !url.pathname.startsWith(`${searchPath}/`)) {
              return null;
            }

            return {
              text: rawLabel.replace(/\s+/g, " "),
              href: url.toString(),
            };
          })
          .filter((value): value is { text: string; href: string } => Boolean(value)),
        new URL(searchUrl).pathname,
      );

      const matches = extractMatches(text, links, searchUrl);
      const screenshot = await page.screenshot({ type: "png", fullPage: true }).catch(() => null);

      if (matches.length === 0 && !looksLikeNoResults(text)) {
        return {
          providerKey: "doctolib",
          providerLabel: "Doctolib",
          searchUrl,
          matches: [],
          screenshotHref: screenshot ? `data:image/png;base64,${screenshot.toString("base64")}` : undefined,
          fallbackReason: "site_changed",
          detail: "Doctolib loaded, but the page structure did not yield stable provider cards for extraction.",
        };
      }

      return {
        providerKey: "doctolib",
        providerLabel: "Doctolib",
        searchUrl,
        matches,
        screenshotHref: screenshot ? `data:image/png;base64,${screenshot.toString("base64")}` : undefined,
        detail:
          matches.length > 0
            ? `Extracted ${matches.length} live provider option${matches.length === 1 ? "" : "s"} from Doctolib.`
            : "Doctolib did not show any matching live appointment cards for the current filters.",
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      providerKey: "doctolib",
      providerLabel: "Doctolib",
      searchUrl,
      matches: [],
      fallbackReason: classifyFallbackReason(error),
      detail: error instanceof Error ? error.message : "Doctolib search failed before results could be extracted.",
    };
  }
}

export async function findLiveAppointmentMatches(task: Pick<Task, "id" | "goal" | "executionTarget" | "input">) {
  if (globalThis.__dreamAgentLiveAppointmentSearch) {
    return globalThis.__dreamAgentLiveAppointmentSearch(task);
  }

  return searchDoctolib(task);
}
