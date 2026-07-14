const WCO_CLASS_NAME = "wco";
const WCO_WINDOWS_CLASS_NAME = "wco-windows";

interface WindowControlsOverlayLike {
  readonly visible: boolean;
  addEventListener(type: "geometrychange", listener: EventListener): void;
  removeEventListener(type: "geometrychange", listener: EventListener): void;
}

interface NavigatorWithWindowControlsOverlay extends Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlayLike;
}

function getWindowControlsOverlay(): WindowControlsOverlayLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (navigator as NavigatorWithWindowControlsOverlay).windowControlsOverlay ?? null;
}

export function syncDocumentWindowControlsOverlayClass(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const overlay = getWindowControlsOverlay();
  const isWindows = /^win(dows)?/i.test(navigator.platform);
  const update = () => {
    const visible = overlay !== null && overlay.visible;
    document.documentElement.classList.toggle(WCO_CLASS_NAME, visible);
    document.documentElement.classList.toggle(WCO_WINDOWS_CLASS_NAME, visible && isWindows);
  };

  update();
  if (!overlay) {
    return () => {};
  }

  overlay.addEventListener("geometrychange", update);
  return () => {
    overlay.removeEventListener("geometrychange", update);
  };
}
