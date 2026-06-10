import { memo } from "react";
import { cn } from "~/lib/utils";
import {
  SIDEBAR_LABEL_COLOR_CLASS,
  SIDEBAR_LABEL_TEXT_CLASS,
} from "../sidebar/sidebarTextStyles";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("uppercase", SIDEBAR_LABEL_COLOR_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
          Plan ready
        </span>
        {planTitle ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              SIDEBAR_LABEL_COLOR_CLASS,
              SIDEBAR_LABEL_TEXT_CLASS,
            )}
          >
            {planTitle}
          </span>
        ) : null}
      </div>
      {/* <div className="mt-2 text-xs text-muted-foreground">
        Review the plan
      </div> */}
    </div>
  );
});
