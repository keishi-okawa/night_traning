import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-dev-shm-usage"
  ]
});

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const runtimeErrors = [];
const failedResponses = [];
const consoleErrors = [];
const failedRequests = [];

page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("requestfailed", (request) => failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
page.on("response", (response) => {
  if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
    failedResponses.push({ status: response.status(), url: response.url() });
  }
});

await page.addInitScript(() => {
  localStorage.setItem("nightflow:v1:onboarding-complete", "true");
  localStorage.setItem("nightflow:v1:settings", JSON.stringify({
    locale: "ja",
    schedule: { routineStart: "22:50", studyStart: "22:55", closingStart: "23:35", bedTime: "23:59" },
    timers: { brushingSeconds: 180 },
    study: { defaultTargetQuestions: 20 },
    guard: { enabled: true, returnThresholdSeconds: 15, guardSeconds: 5, exemptionExpiryHours: 2 },
    display: { monochromeEnabled: true, reduceAnimation: true }
  }));
});

try {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main .page", { timeout: 15000 });
  await page.waitForSelector(".island-3d-scene", { timeout: 15000 });
  await page.waitForTimeout(3000);
  const sceneDiagnostics = await page.evaluate(() => ({
    moduleLoaded: !!window.NightFlow3D,
    sceneCount: document.querySelectorAll(".island-3d-scene").length,
    sceneStates: [...document.querySelectorAll(".island-3d-scene")].map(el => ({
      mounted: el.dataset.mounted || "not-mounted",
      children: el.children.length,
      canvas: !!el.querySelector("canvas"),
      fallback: !!el.querySelector(".island-webgl-fallback")
    })),
    scriptSources: [...document.scripts].map(el => el.src).filter(Boolean)
  }));
  if (!sceneDiagnostics.sceneStates.some(s => s.canvas || s.fallback)) {
    throw new Error("3D initialization did not finish: " + JSON.stringify({
      sceneDiagnostics, runtimeErrors, consoleErrors, failedResponses, failedRequests
    }));
  }

  const campaignVisible = await page.locator("#main .campaign-card").first().isVisible();
  if (!campaignVisible) throw new Error("Main campaign card was not visible on the home screen.");

  await page.locator("#nav-roadmap").click();
  await page.waitForSelector("#plannerExamDate", { timeout: 10000 });

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 45);
  const yyyy = futureDate.getFullYear();
  const mm = String(futureDate.getMonth() + 1).padStart(2, "0");
  const dd = String(futureDate.getDate()).padStart(2, "0");
  await page.locator("#plannerExamDate").fill(`${yyyy}-${mm}-${dd}`);
  await page.locator("#plannerMinutes").fill("35");
  await page.locator("#plannerQuestions").fill("20");
  await page.locator('[data-action="roadmap-generate"]').click();

  await page.waitForTimeout(500);
  const plannerDiagnostics = await page.evaluate(() => ({
    values: {
      exam: document.querySelector("#plannerExamDate")?.value,
      minutes: document.querySelector("#plannerMinutes")?.value,
      questions: document.querySelector("#plannerQuestions")?.value,
      weekdays: [...document.querySelectorAll('input[name="plannerDay"]:checked')].map(x=>x.value)
    },
    toast: document.querySelector("#toastRoot")?.innerText || "",
    savedPlan: !!localStorage.getItem("nightflow:v1:auto-plan-generated"),
    mainText: document.querySelector("#main")?.innerText.slice(0,1200) || ""
  }));
  const taskCount = await page.locator(".gantt-week .gantt-task").count();
  if (taskCount < 1) throw new Error("The Gantt chart was generated without any daily tasks: " + JSON.stringify(plannerDiagnostics));

  const serviceWorkerActive = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return !!registration.active;
  });
  if (!serviceWorkerActive) throw new Error("Service Worker did not become active.");
  const shellCached = await page.evaluate(async () => (await caches.keys()).includes("night-flow-shell-v3"));
  if (!shellCached) throw new Error("PWA app shell was not cached.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".island-3d-scene", { timeout: 15000 });
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!controlled) throw new Error("The page was not controlled by the Service Worker after reload.");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main .page", { timeout: 15000 });
  const offlineHomeLoaded = await page.locator("#main .page").count() > 0;
  await context.setOffline(false);
  if (!offlineHomeLoaded) throw new Error("The app did not reopen from the offline cache.");
  await page.locator("#nav-roadmap").click();
  await page.waitForSelector(".gantt-week .gantt-task", { timeout: 10000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const ganttVisibleOnMobile = await page.locator(".gantt-week").isVisible();
  const mobileOverflow = await page.evaluate(() => {
    const main = document.querySelector("#main");
    return main.scrollWidth > window.innerWidth + 4;
  });
  if (!ganttVisibleOnMobile) throw new Error("Gantt chart was not visible at mobile viewport width.");
  if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(" | ")}`);
  if (consoleErrors.some(x=>/Failed to load module script|three\.core|island-3d/.test(x))) throw new Error(`Module errors: ${consoleErrors.join(" | ")}`);
  if (failedResponses.length) throw new Error(`Failed requests: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({
    result: "passed",
    campaignVisible,
    webglCanvas: sceneDiagnostics.sceneStates.some(s => s.canvas),
    serviceWorkerActive,
    shellCached,
    offlineHomeLoaded,
    ganttTasksThisWeek: taskCount,
    ganttVisibleOnMobile,
    mobileHorizontalOverflow: mobileOverflow,
    sceneDiagnostics,
    consoleErrors: consoleErrors.slice(0,5),
    failedRequests
  }));
} finally {
  await browser.close();
}
