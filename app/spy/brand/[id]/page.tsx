import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export const dynamic = "force-dynamic";

export default async function BrandDeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const search = searchParams ? await searchParams : {};
  const initialTab =
    search?.tab === "products" || search?.tab === "creatives" || search?.tab === "analytics"
      ? (search.tab as "analytics" | "products" | "creatives")
      : undefined;

  return <BrandDeepDiveView id={id} isModal={false} initialTab={initialTab} />;
}
