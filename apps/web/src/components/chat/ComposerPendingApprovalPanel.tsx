import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";
import { SIDEBAR_MUTED_TEXT_CLASS } from "../sidebar/sidebarTextStyles";

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
          : "Approval requested";
  const approvalDetail = approval.detail?.trim();

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-base leading-6 sm:text-sm sm:leading-5">
        <span className="font-medium text-foreground">
          {approvalSummary}
          {approvalDetail ? ":" : ""}
        </span>
        {approvalDetail ? (
          <span className={cn("min-w-0 break-words", SIDEBAR_MUTED_TEXT_CLASS)}>
            {approvalDetail}
          </span>
        ) : null}
        {pendingCount > 1 ? (
          <span className={cn("text-sm", SIDEBAR_MUTED_TEXT_CLASS)}>1/{pendingCount}</span>
        ) : null}
      </div>
    </div>
  );
});
