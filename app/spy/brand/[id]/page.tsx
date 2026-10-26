import { BrandDeepDiveView } from "@/components/spy/brand-deep-dive-view";

export const dynamic = "force-dynamic";

export default async function BrandDeepDivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BrandDeepDiveView id={id} isModal={false} />;
}
