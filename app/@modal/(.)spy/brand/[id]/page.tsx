import { BrandOverlaySheet } from "@/components/spy/brand-overlay-sheet";
import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export const dynamic = "force-dynamic";

export default async function InterceptedBrandModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <BrandOverlaySheet brandId={id}>
      <BrandDeepDiveView id={id} isModal={true} />
    </BrandOverlaySheet>
  );
}
