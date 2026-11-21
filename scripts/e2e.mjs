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
  // Run the smoke test in the app's normal/home mode regardless of the
  // GitHub runner's timezone or local clock.
  await page.evaluate(() => {
    if (typeof syncMode !== "function") throw new Error("Night Flow did not finish initializing.");
    previewMode = "FREE";
    syncMode();
  });
  await page.waitForTimeout(500);
  const initialDiagnostics = await page.evaluate(() => ({
    previewMode: typeof previewMode === "undefined" ? "unavailable" : previewMode,
    screen: typeof screen === "undefined" ? "unavailable" : screen,
    currentMode: typeof currentMode === "undefined" ? "unavailable" : currentMode,
    phase: typeof getPhase === "function" ? getPhase() : "unavailable",
    sceneCount: document.querySelectorAll(".island-3d-scene").length,
    mainClass: document.querySelector("#main .page")?.className || null,
    mainText: document.querySelector("#main")?.innerText.slice(0, 600) || "",
    mainHtml: document.querySelector("#main")?.innerHTML.slice(0, 1600) || "",
    moduleLoaded: !!window.NightFlow3D
  }));
  if (!initialDiagnostics.sceneCount) {
    throw new Error("Initial home did not render the 3D island: " + JSON.stringify(initialDiagnostics));
  }
  const sceneLocator = page.locator(".island-3d-scene").first();
  await sceneLocator.waitFor({ state: "attached", timeout: 15000 });
  await page.waitForTimeout(500);
  const sceneLayout = await sceneLocator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const ancestors = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const current = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      ancestors.push({
        tag: node.tagName,
        id: node.id || "",
        className: typeof node.className === "string" ? node.className : "",
        display: current.display,
        visibility: current.visibility,
        opacity: current.opacity,
        width: Math.round(box.width),
        height: Math.round(box.height)
      });
      if (node.id === "main") break;
    }
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      canvasWidth: el.querySelector("canvas")?.width || 0,
      canvasHeight: el.querySelector("canvas")?.height || 0,
      ancestors
    };
  });
  console.log("SCENE_LAYOUT " + JSON.stringify(sceneLayout));
  if (sceneLayout.display === "none" || sceneLayout.visibility !== "visible" || sceneLayout.width < 100 || sceneLayout.height < 100) {
    throw new Error("3D island container is not visibly laid out: " + JSON.stringify(sceneLayout));
  }
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
  const shellCached = await page.evaluate(async () => (await caches.keys()).includes("night-flow-shell-v4"));
  if (!shellCached) throw new Error("PWA app shell was not cached.");
  await page.reload({ waitUntil: "domcontentloaded" });
  // The last user destination was the roadmap screen; reload must restore it,
  // not force the user back to the home screen.
  await page.waitForSelector("#plannerExamDate", { timeout: 15000 });
  const restoredRoadmap = await page.locator("#plannerExamDate").isVisible();
  if (!restoredRoadmap) throw new Error("The saved roadmap destination was not restored after reload.");
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!controlled) throw new Error("The page was not controlled by the Service Worker after reload.");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#plannerExamDate", { timeout: 15000 });
  const offlinePlannerLoaded = await page.locator("#plannerExamDate").isVisible();
  await context.setOffline(false);
  if (!offlinePlannerLoaded) throw new Error("The saved roadmap screen did not reopen from the offline cache.");
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
  if (mobileOverflow) throw new Error("The app overflows horizontally on mobile.");

  // Goal-first interruption guard: explain the purpose, prevent accidental
  // dismissal, then return the user to the exact task they came from.
  await page.locator("#nav-settings").click();
  await page.locator('[data-action="preview"][data-mode="STUDY"]').click();
  await page.waitForSelector("#main .routine-shell", { timeout: 10000 });
  const studyTitleBeforeGuard = (await page.locator("#main .routine-shell .h2").first().innerText()).trim();
  const phaseAdvance = await page.evaluate(() => {
    previewMode = "CLOSING";
    const context = getGuardReturnContext("resume");
    const result = {
      originMode: context.originMode,
      originPhase: context.originPhase,
      goal: context.goal,
      nextAction: context.nextAction,
      buttonLabel: context.buttonLabel
    };
    previewMode = "STUDY";
    syncMode();
    return result;
  });
  if (phaseAdvance.originPhase !== "CLOSING" || !phaseAdvance.goal.includes("今日できたこと")) {
    throw new Error("A time-phase change did not update the return purpose: " + JSON.stringify(phaseAdvance));
  }
  await page.locator('#main [data-action="guard"]').click();
  const guardModal = page.locator("#modalRoot .guard-modal");
  await guardModal.waitFor({ state: "visible", timeout: 5000 });
  const guardGoal = (await guardModal.locator(".guard-goal").innerText()).trim();
  const guardNextAction = (await guardModal.locator(".guard-next strong").innerText()).trim();
  const guardReturnButton = page.locator("#guardReturn");
  const guardButtonDisabledInitially = await guardReturnButton.isDisabled();
  if (!guardGoal.includes("基本情報技術者試験")) {
    throw new Error("The guard did not remind the user of the study purpose: " + guardGoal);
  }
  if (!guardNextAction.includes("過去問")) {
    throw new Error("The guard did not describe the next concrete study action: " + guardNextAction);
  }
  if (!guardButtonDisabledInitially) throw new Error("The return action was enabled before the pause finished.");

  await page.locator("#modalRoot .modal-backdrop").click({ position: { x: 4, y: 4 } });
  const guardBackdropDismissBlocked = await guardModal.isVisible();
  if (!guardBackdropDismissBlocked) throw new Error("The interruption guard closed when its backdrop was clicked.");

  await page.waitForFunction(() => {
    const button = document.querySelector("#guardReturn");
    return !!button && !button.disabled;
  }, null, { timeout: 9000 });
  await guardReturnButton.click();
  await guardModal.waitFor({ state: "detached", timeout: 5000 });
  const studyTitleAfterGuard = (await page.locator("#main .routine-shell .h2").first().innerText()).trim();
  const guardContextPersisted = await page.evaluate(() => {
    const key = [...Array(localStorage.length)].map((_, i) => localStorage.key(i))
      .find(value => value && value.startsWith("nightflow:v1:session:"));
    if (!key) return false;
    const session = JSON.parse(localStorage.getItem(key));
    return session?.guard?.returnContext?.status === "resumed"
      && !!session.guard.returnContext.resumedAt
      && session.guard.returnContext.resumedScreen === "study";
  });
  if (studyTitleAfterGuard !== studyTitleBeforeGuard) {
    throw new Error("The guard did not restore the original study screen.");
  }
  if (!guardContextPersisted) throw new Error("The return destination was not persisted after resuming.");

  if (runtimeErrors.length) throw new Error(`Runtime errors: ${runtimeErrors.join(" | ")}`);
  if (consoleErrors.some(x=>/Failed to load module script|three\.core|island-3d/.test(x))) throw new Error(`Module errors: ${consoleErrors.join(" | ")}`);
  if (failedResponses.length) throw new Error(`Failed requests: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({
    result: "passed",
    campaignVisible,
    webglCanvas: sceneDiagnostics.sceneStates.some(s => s.canvas),
    serviceWorkerActive,
    shellCached,
    offlinePlannerLoaded,
    restoredRoadmap,
    ganttTasksThisWeek: taskCount,
    ganttVisibleOnMobile,
    mobileHorizontalOverflow: mobileOverflow,
    guardPurposeVisible: guardGoal.length > 0,
    phaseAdvancePurposeUpdated: phaseAdvance.originPhase === "CLOSING" && phaseAdvance.goal.includes("今日できたこと"),
    phaseAdvance,
    guardNextAction,
    guardButtonDisabledInitially,
    guardBackdropDismissBlocked,
    guardRestoredOriginalScreen: studyTitleAfterGuard === studyTitleBeforeGuard,
    guardContextPersisted,
    sceneDiagnostics,
    consoleErrors: consoleErrors.slice(0,5),
    failedRequests
  }));
} finally {
  await browser.close();
}
