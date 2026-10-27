import { BrandOverlaySheet } from "@/components/spy/brand-overlay-sheet";
import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export const dynamic = "force-dynamic";

export default async function InterceptedBrandModalPage({
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

  return (
    <BrandOverlaySheet brandId={id}>
      <BrandDeepDiveView id={id} isModal={true} initialTab={initialTab} />
    </BrandOverlaySheet>
  );
}
