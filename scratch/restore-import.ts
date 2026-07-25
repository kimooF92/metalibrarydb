import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

async function restore() {
  const { db, client } = await import("../db");
  const { processFileImport } = await import("../actions/import");

  try {
    const filePath = path.resolve("Untitled spreadsheet.xlsx");
    if (!fs.existsSync(filePath)) {
      console.log("File not found:", filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await processFileImport(buffer, "Untitled spreadsheet.xlsx");
    console.log("Restore re-import result:", result);
  } catch (err) {
    console.error("Restore failed:", err);
  } finally {
    await client.end();
  }
}

restore();
