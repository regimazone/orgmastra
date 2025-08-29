"use client";
import loadTranslations from "@/loadTranslations";
import { GTClientProvider } from "gt-next/client";
import { ReactNode } from "react";

export const GtProviderWrapper = ({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) => {
  return (
    <GTClientProvider locale={locale} loadTranslations={loadTranslations}>
      {children}
    </GTClientProvider>
  );
};
