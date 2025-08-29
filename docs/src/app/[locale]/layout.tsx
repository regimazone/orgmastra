import { GtProviderWrapper } from "@/components/gt-provider";
import loadTranslations from "@/loadTranslations";

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <GtProviderWrapper locale={locale}>{children}</GtProviderWrapper>;
}
