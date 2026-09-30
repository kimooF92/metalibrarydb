import { NextRequest, NextResponse } from "next/server";
import { addProductUrlSchema } from "@/lib/validators";
import { addProductPageLink } from "@/actions/add-product-url";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = addProductUrlSchema.parse(body);
    const allowDuplicate = Boolean(validated.allowDuplicate);
    const runner = validated.runner || "local";

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const webhookBaseUrl = `${protocol}://${host}`;

    const result = await addProductPageLink(validated.url, {
      allowDuplicate,
      runner,
      webhookBaseUrl,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.message,
          page: result.page,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: result.isNewBrand ? 201 : 200 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Invalid product URL format." },
        { status: 400 }
      );
    }
    console.error("Error in POST /api/products/add-url:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add product URL." },
      { status: 500 }
    );
  }
}
