import { CircleAlertIcon, ImageIcon, XIcon } from "lucide-react";
import type { MouseEventHandler } from "react";
import { cn } from "~/lib/utils";
import type { ChatImageAttachment } from "../../types";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";

type ImageAttachmentPreviewStripVariant = "composer" | "message";

interface ImageAttachmentPreviewStripProps<
  TImage extends ChatImageAttachment = ChatImageAttachment,
> {
  images: ReadonlyArray<TImage>;
  variant?: ImageAttachmentPreviewStripVariant;
  className?: string;
  nonPersistedImageIds?: ReadonlySet<string>;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  onRemoveImage?: (imageId: string) => void;
}

interface AttachmentRemoveButtonProps {
  ariaLabel: string;
  className?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export function AttachmentRemoveButton({
  ariaLabel,
  className,
  onClick,
}: AttachmentRemoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "absolute right-0 top-0 z-10 inline-flex size-[22px] -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-transparent dark:bg-[#525252] dark:text-white dark:shadow-none dark:hover:bg-[#666666] dark:hover:text-white",
        className,
      )}
      onClick={onClick}
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

export function ImageAttachmentPreviewStrip<
  TImage extends ChatImageAttachment = ChatImageAttachment,
>({
  images,
  variant = "message",
  className,
  nonPersistedImageIds,
  onExpandImage,
  onRemoveImage,
}: ImageAttachmentPreviewStripProps<TImage>) {
  if (images.length === 0) return null;

  const isComposer = variant === "composer";

  return (
    <div
      className={cn(
        isComposer
          ? "mb-3 flex max-w-full flex-wrap items-center gap-2"
          : "mb-2 grid max-w-[420px] gap-2",
        !isComposer && (images.length === 1 ? "grid-cols-1" : "grid-cols-2"),
        className,
      )}
    >
      {images.map((image) => (
        <ImageAttachmentPreviewTile
          key={image.id}
          image={image}
          images={images}
          variant={variant}
          showPersistenceWarning={nonPersistedImageIds?.has(image.id) ?? false}
          onExpandImage={onExpandImage}
          onRemoveImage={onRemoveImage}
        />
      ))}
    </div>
  );
}

function ImageAttachmentPreviewTile<TImage extends ChatImageAttachment>({
  image,
  images,
  variant,
  showPersistenceWarning,
  onExpandImage,
  onRemoveImage,
}: {
  image: TImage;
  images: ReadonlyArray<TImage>;
  variant: ImageAttachmentPreviewStripVariant;
  showPersistenceWarning: boolean;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  onRemoveImage?: (imageId: string) => void;
}) {
  const isComposer = variant === "composer";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-visible",
        isComposer && "size-8",
        isComposer && onRemoveImage && "mr-3.5",
      )}
    >
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-md border border-border/80 bg-background shadow-xs/5 dark:border-white/12 dark:bg-transparent dark:shadow-none",
          isComposer ? "size-8" : "min-h-[72px]",
        )}
      >
        {image.previewUrl ? (
          <button
            type="button"
            className="block h-full w-full cursor-zoom-in overflow-hidden text-left"
            aria-label={`Preview ${image.name}`}
            onClick={() => {
              const preview = buildExpandedImagePreview(images, image.id);
              if (!preview) return;
              onExpandImage(preview);
            }}
          >
            <img
              src={image.previewUrl}
              alt={image.name}
              className={cn(
                "w-full select-none object-cover",
                isComposer ? "h-full" : "block h-auto max-h-[220px]",
              )}
              draggable={false}
            />
          </button>
        ) : (
          <div
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-1 text-center text-muted-foreground/70",
              isComposer
                ? "px-1 text-[8px] leading-none"
                : "min-h-[72px] px-2 py-3 text-sm leading-relaxed",
            )}
          >
            <ImageIcon
              className={cn("shrink-0 opacity-70", isComposer ? "size-3" : "size-4")}
            />
            <span className="line-clamp-2 break-all">{image.name}</span>
          </div>
        )}

        {showPersistenceWarning ? <DraftPersistenceWarningBadge compact={isComposer} /> : null}
      </div>

      {isComposer && onRemoveImage ? (
        <AttachmentRemoveButton
          ariaLabel={`Remove ${image.name}`}
          onClick={() => onRemoveImage(image.id)}
        />
      ) : null}
    </div>
  );
}

function DraftPersistenceWarningBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label="Draft attachment may not persist"
            className={cn(
              "absolute z-10 inline-flex items-center justify-center rounded-full border border-amber-500/20 bg-background/90 text-amber-600 shadow-sm",
              compact ? "left-1 top-1 size-4" : "left-1 top-1 size-5",
            )}
          >
            <CircleAlertIcon className={compact ? "size-2.5" : "size-3.5"} />
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-64 whitespace-normal leading-tight">
        Draft attachment could not be saved locally and may be lost on navigation.
      </TooltipPopup>
    </Tooltip>
  );
}
