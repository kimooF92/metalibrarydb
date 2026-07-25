import { NextResponse } from "next/server";
import { processFileImport } from "@/actions/import";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided in request" },
        { status: 400 }
      );
    }

    const filename = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const summary = await processFileImport(buffer, filename);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("Error in POST /api/import:", error);
    return NextResponse.json(
      { error: "Failed to process imported file" },
      { status: 500 }
    );
  }
}
