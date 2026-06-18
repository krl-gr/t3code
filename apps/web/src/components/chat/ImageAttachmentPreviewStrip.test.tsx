import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ImageAttachmentPreviewStrip } from "./ImageAttachmentPreviewStrip";

describe("ImageAttachmentPreviewStrip", () => {
  it("renders composer previews with remove controls and persistence warnings", () => {
    const html = renderToStaticMarkup(
      <ImageAttachmentPreviewStrip
        variant="composer"
        images={[
          {
            type: "image",
            id: "image-1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            previewUrl: "blob:screenshot",
          },
        ]}
        nonPersistedImageIds={new Set(["image-1"])}
        onExpandImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Preview screenshot.png"');
    expect(html).toContain('alt="screenshot.png"');
    expect(html).toContain('aria-label="Remove screenshot.png"');
    expect(html).toContain('aria-label="Draft attachment may not persist"');
  });

  it("renders a non-previewable image placeholder without composer-only controls", () => {
    const html = renderToStaticMarkup(
      <ImageAttachmentPreviewStrip
        images={[
          {
            type: "image",
            id: "image-1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 1024,
          },
        ]}
        onExpandImage={vi.fn()}
      />,
    );

    expect(html).toContain("screenshot.png");
    expect(html).not.toContain('aria-label="Preview screenshot.png"');
    expect(html).not.toContain('aria-label="Remove screenshot.png"');
  });
});
