/**
 * Rendered instead of the spike when `navigator.hid` is absent (Firefox, Safari,
 * an insecure context, or WebHID disabled by policy). Never a broken button.
 */
export function renderUnsupportedView(container: HTMLElement): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "unsupported";
  wrap.innerHTML = `
    <h1>WebHID is not available</h1>
    <p>Motion World — Sensor Test requires a current version of
       <strong>Chrome</strong> or <strong>Edge</strong> on the desktop, served
       over <strong>HTTPS</strong> (or <code>http://localhost</code>), with
       WebHID enabled.</p>
    <p class="diag">Checked: <code>"hid" in navigator</code> &rarr; false.</p>
    <p>If you are already using Chrome or Edge, WebHID may be turned off by your
       browser or organisation policy. That is a valid Milestone Zero finding
       (feasibility class D — environment blocked), not a hardware failure.</p>
  `;
  container.appendChild(wrap);
}
