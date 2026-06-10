import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";
import {
  SIDEBAR_LABEL_COLOR_CLASS,
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "../sidebar/sidebarTextStyles";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const approvalSummary =
    approval.requestKind === "command"
      ? "Command approval requested"
      : approval.requestKind === "file-read"
        ? "File-read approval requested"
        : approval.requestKind === "file-change"
          ? "File-change approval requested"
          : "Computer action approval requested";

  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("uppercase", SIDEBAR_LABEL_COLOR_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
          PENDING APPROVAL
        </span>
        <span className={cn(SIDEBAR_LABEL_COLOR_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
          {approvalSummary}
        </span>
        {pendingCount > 1 ? (
          <span className={cn(SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
            1/{pendingCount}
          </span>
        ) : null}
      </div>
    </div>
  );
});
