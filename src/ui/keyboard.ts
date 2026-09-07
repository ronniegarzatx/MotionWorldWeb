import type { AcquisitionController } from "../acquisition/acquisition-controller.js";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const NATIVE_SPACE = new Set(["BUTTON", "A", "SUMMARY"]);

function isEditable(node: Element | null): boolean {
  if (!node) return false;
  if (EDITABLE.has(node.tagName)) return true;
  return (node as HTMLElement).isContentEditable === true;
}

function handlesSpaceNatively(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false;
  if (NATIVE_SPACE.has(node.tagName)) {
    if (node.tagName === "A") return (node as HTMLAnchorElement).hasAttribute("href");
    return true;
  }
  return node.getAttribute("role") === "button";
}

/**
 * `Space` toggles Start/Stop — but only when focus is not in an editable field
 * and not on an element that already activates on Space (a focused button / link),
 * so a focused control never double-fires. Returns an uninstaller.
 */
export function installStartStopKey(
  controller: AcquisitionController,
  doc: Document = document,
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== " " && e.code !== "Space") return;
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditable(doc.activeElement)) return;
    if (handlesSpaceNatively(e.target)) return;

    const ui = controller.uiState;
    if (ui.canStart) {
      e.preventDefault();
      void controller.start();
    } else if (ui.canStop) {
      e.preventDefault();
      void controller.stop();
    }
  };

  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
