"use client";

export const WORKSHEET_BUILDER_NAVIGATION_GUARD_EVENT =
  "worksheet-builder:navigation-request";

export type WorksheetBuilderNavigationRequestDetail = {
  href: string;
  allowNavigation: boolean;
};

export function requestWorksheetBuilderNavigation(href: string) {
  if (typeof window === "undefined") {
    return true;
  }

  const detail: WorksheetBuilderNavigationRequestDetail = {
    href,
    allowNavigation: true,
  };

  window.dispatchEvent(
    new CustomEvent<WorksheetBuilderNavigationRequestDetail>(
      WORKSHEET_BUILDER_NAVIGATION_GUARD_EVENT,
      { detail },
    ),
  );

  return detail.allowNavigation;
}
