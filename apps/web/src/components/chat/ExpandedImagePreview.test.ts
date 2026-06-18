import { describe, expect, it } from "vitest";

import { buildExpandedImagePreview } from "./ExpandedImagePreview";

describe("buildExpandedImagePreview", () => {
  it("builds a gallery from previewable images and selects the clicked image", () => {
    expect(
      buildExpandedImagePreview(
        [
          { id: "image-a", name: "a.png", previewUrl: "blob:a" },
          { id: "image-b", name: "b.png" },
          { id: "image-c", name: "c.png", previewUrl: "blob:c" },
        ],
        "image-c",
      ),
    ).toEqual({
      images: [
        { src: "blob:a", name: "a.png" },
        { src: "blob:c", name: "c.png" },
      ],
      index: 1,
    });
  });

  it("returns null when the selected image has no preview URL", () => {
    expect(
      buildExpandedImagePreview(
        [
          { id: "image-a", name: "a.png", previewUrl: "blob:a" },
          { id: "image-b", name: "b.png" },
        ],
        "image-b",
      ),
    ).toBeNull();
  });
});
