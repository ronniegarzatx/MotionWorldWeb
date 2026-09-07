# Motion World Web — Sensor Test — Windows + CBR 2 procedure

This is the **one unavoidable gate** for Milestone Zero. The software is done
and green on the Mac; only the real Vernier CBR 2 / Go!Motion on the Windows
work PC can move any result from **SOFTWARE VERIFIED** to **HARDWARE VERIFIED**.

Do the test in **Chrome** or **Edge** (whichever the work PC has). Keep this
page open in a second tab so you can paste the diagnostics back.

---

## A. Getting the test page onto the Windows PC

Pick whichever is available. **Option 1 (HTTPS) is strongly preferred** because
the real product must be zero-install over HTTPS anyway.

### Option 1 — an HTTPS URL (best)

Deploy the static build to any static host and open that URL on the work PC:

```
npm ci
npm run build          # produces dist/
```

Then upload `dist/` to one of:

- **GitHub Pages** — put `dist/` on a `gh-pages` branch (or use the Pages
  "deploy from a folder" action). URL: `https://<user>.github.io/<repo>/`.
  *Do not create/push the repo without explicit authorisation — that step is
  the user's to take.*
- **Netlify / Cloudflare Pages / Vercel (static)** — drag-and-drop `dist/`,
  no build command, no functions. URL is HTTPS automatically.
- A school/existing web server that already serves HTTPS — copy `dist/` there.

No backend, no serverless function, no environment variables. It is pure static
files.

### Option 2 — localhost on the work PC (fallback)

Only if you cannot host it and you can copy files to the work PC. `localhost`
is a secure context, so WebHID works.

1. Copy the built `dist/` folder to the Windows PC (USB stick / network share).
2. Serve it with any static server that is already there, e.g. one of:
   - If Python is on the PC: `cd dist && python -m http.server 8080`
   - If Node is on the PC: `cd dist && npx --yes serve -l 8080`
3. Open `http://localhost:8080/` in Chrome or Edge.

> This uses a server **only to serve files during the test**. It is not part of
> the product and nothing is installed permanently. If neither Python nor Node
> is available and you cannot host it, tell the user — we will set up Option 1.

Opening `dist/index.html` directly as a `file://` URL will **not** work
(WebHID needs a secure *http(s)* context).

---

## B. The test

Have the page open. Plug the CBR 2 into USB **before** step 3.

| # | Do this | Expected | Write down |
|---|---|---|---|
| 1 | Plug the CBR 2 into the Windows PC. | Windows chimes; no "driver needed" balloon. | Did Windows ask for a driver? Y/N |
| 2 | Open the test page. | Title "MOTION WORLD — SENSOR TEST"; "Sensor: Not connected". If instead you see "WebHID is not available" → **stop, paste that, note the browser + version** (this is feasibility class D). | screen seen |
| 3 | Click **CONNECT SENSOR**. | Browser's own device chooser appears. | Does a Vernier / Go!Motion / CBR 2 entry appear in the list? |
| 4 | Select the Vernier device, click Connect/Pair. | Status → "CBR 2 / Go!Motion — Connected"; the **Device info** panel fills in. | paste the whole **Device info** panel |
| 5 | If step 3 or 4 fails | Click **copy** under Device info anyway (it may still have data); copy the whole **Event log**. | paste both |
| 6 | Click **SENSOR READY**. | Event log: "sensor ready" / "trigger…"; state → SENSOR_READY. | log lines |
| 7 | Click **START**. | State → MEASURING; **POSITION** starts updating. | first few POSITION values |
| 8 | Move a book / your body between ~0.5 m and ~3 m from the sensor. | POSITION tracks the distance, sensible metres, larger when farther. | does it track? any wild jumps? |
| 9 | Let it run ~30 seconds. | Steady updates; "Observed rate" settles near **25 Hz**; "Last interval" near **40 ms**; no growing lag. | Observed rate, Mean interval, Stdev, Min/Max |
| 10 | Click **STOP**. | POSITION freezes; Event log: "MotionRun formed: N samples…". | N samples, duration |
| 11 | Click **START** again. | Measures again immediately, no re-connect. | ok? |
| 12 | Repeat START/STOP **3 times**. | Reliable every time. | any failure |
| 13 | **START** and leave it running **≥ 5 minutes**. | No freeze, no console error, "Observed rate" stays ~25 Hz, memory not ballooning (check Task Manager if you can). | rate at 5 min, any lag, any error line |
| 14 | While still measuring, **unplug** the CBR 2. | State → DEVICE_LOST within ~1 s; Event log says "device lost"; page does **not** crash; the partial run is still formed. | how fast, exact log line |
| 15 | **Replug** the CBR 2. | — | — |
| 16 | Click **CONNECT SENSOR** (or **RECONNECT SENSOR** if shown). | Reconnects, ideally without a second OS permission dialog. | second dialog? Y/N |
| 17 | **Refresh the page** (F5). | On load the page tries a silent reconnect. Note which happens: (a) it reconnects by itself, or (b) you must click **RECONNECT SENSOR**, or (c) you must click **CONNECT SENSOR** and pick the device again. | a / b / c |
| 18 | With the sensor armed (SENSOR READY), press the **physical blue button** on the CBR 2. | Event log shows a "trigger start" and state → MEASURING; press again → "trigger stop". | exactly what the Event log shows on each press |
| 19 | Click **CLEAR LOG**, then **copy** the Device info once more for the record. | — | paste |

---

## C. Paste this back (to ChatGPT / Claude)

```
BROWSER:            Chrome / Edge  version ______
HOW OPENED:         HTTPS url ______  |  localhost copy
WINDOWS DRIVER:     asked for a driver?  Y / N

STEP 3  chooser listed a compatible device?      Y / N   (name shown: ______)
STEP 4  connected?  Y / N

--- DEVICE INFO PANEL (paste verbatim) ---
<paste>
------------------------------------------

STEP 7-9  POSITION tracked distance?             Y / N
          Observed rate: ______ Hz
          Mean interval: ______ ms   Stdev: ______ ms   Min/Max: ______ / ______ ms
STEP 12   3x START/STOP reliable?                Y / N
STEP 13   5-minute run — rate at end: ______ Hz  lag grew? Y / N   any error line? ______
STEP 14   unplug -> DEVICE_LOST in ~1s?          Y / N   log line: ______
STEP 16   reconnect after replug needed a 2nd OS dialog?   Y / N
STEP 17   after refresh:  (a) auto  /  (b) RECONNECT click  /  (c) full CONNECT + pick
STEP 18   blue button:  event log on press 1: ______   on press 2: ______

--- FULL EVENT LOG (paste verbatim) ---
<paste>
---------------------------------------

Anything weird:
```

---

## D. How the result is classified (spec §21)

- **A — Direct WebHID viable:** steps 3–13 all pass, blue button works (18).
  → proceed to the app shell + Live / Data Display.
- **B — Viable with a minor limitation:** measurement works but e.g. the blue
  button (18) does nothing, or refresh needs a RECONNECT click (17b/17c).
  → proceed, document the limitation. A reconnect click is **not** a failure.
- **C — Protocol work required:** the device connects and opens (4) but START
  produces no samples, or the rate/jitter (9) is unusable. → paste the Device
  info + raw HID panel; focused protocol work before labs.
- **D — Environment blocked:** step 2 shows "WebHID is not available", or the
  chooser never lists the device and it is a policy block. → not a hardware or
  protocol failure; it is the work network's browser policy.
- **E — Not viable:** only if the evidence shows the browser genuinely cannot
  drive the sensor without a forbidden native helper. Do not jump here from one
  bad run.
