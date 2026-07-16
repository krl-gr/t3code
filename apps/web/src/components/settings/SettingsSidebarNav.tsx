import { useCallback, type ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BotIcon,
  GitBranchIcon,
  KeyboardIcon,
  Link2Icon,
  Settings2Icon,
} from "lucide-react";
import { useCanGoBack, useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { SIDEBAR_LABEL_TEXT_CLASS, SIDEBAR_MUTED_TEXT_CLASS } from "../sidebar/sidebarTextStyles";
import { WebFeatureSettingsNavigationItems } from "../product/WebFeatureSettingsNavigation";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/archived";

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Keybindings", to: "/settings/keybindings", icon: KeyboardIcon },
  { label: "Providers", to: "/settings/providers", icon: BotIcon },
  { label: "Source Control", to: "/settings/source-control", icon: GitBranchIcon },
  { label: "Connections", to: "/settings/connections", icon: Link2Icon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSectionClick = useCallback(
    (to: SettingsSectionPath) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({ to, replace: true });
    },
    [isMobile, navigate, setOpenMobile],
  );
  const handleBackClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, isMobile, navigate, setOpenMobile]);

  return (
    <>
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="px-2 pt-2 pb-2">
          <SidebarMenu className="gap-0.5">
            {SETTINGS_NAV_ITEMS.slice(0, 1).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActive}
                    className={
                      isActive
                        ? "h-8 gap-2 px-2 text-left hover:bg-accent data-[active=true]:bg-accent data-[active=true]:text-foreground dark:hover:text-white/86 dark:data-[active=true]:bg-white/[0.06] dark:data-[active=true]:text-white/82"
                        : `h-8 gap-2 px-2 text-left hover:bg-accent hover:text-foreground dark:hover:text-white/86 ${SIDEBAR_MUTED_TEXT_CLASS}`
                    }
                    onClick={() => handleSectionClick(item.to)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span
                      className={
                        SIDEBAR_LABEL_TEXT_CLASS + " truncate text-foreground/72 dark:text-white/82"
                      }
                    >
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            <WebFeatureSettingsNavigationItems />
            {SETTINGS_NAV_ITEMS.slice(1).map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActive}
                    className={
                      isActive
                        ? "h-8 gap-2 px-2 text-left hover:bg-accent data-[active=true]:bg-accent data-[active=true]:text-foreground dark:hover:text-white/86 dark:data-[active=true]:bg-white/[0.06] dark:data-[active=true]:text-white/82"
                        : `h-8 gap-2 px-2 text-left hover:bg-accent hover:text-foreground dark:hover:text-white/86 ${SIDEBAR_MUTED_TEXT_CLASS}`
                    }
                    onClick={() => handleSectionClick(item.to)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span
                      className={
                        SIDEBAR_LABEL_TEXT_CLASS + " truncate text-foreground/72 dark:text-white/82"
                      }
                    >
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className={`h-8 gap-2 px-2 hover:bg-accent hover:text-foreground dark:hover:text-white/86 ${SIDEBAR_MUTED_TEXT_CLASS}`}
              onClick={handleBackClick}
            >
              <ArrowLeftIcon className="size-4" />
              <span className={SIDEBAR_LABEL_TEXT_CLASS + " text-foreground/72 dark:text-white/82"}>
                Back
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
