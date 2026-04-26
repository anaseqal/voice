import { NextResponse } from "next/server";
import { worker } from "@/lib/runpod";

export async function GET() {
  try {
    const h = await worker.health();
    return NextResponse.json({ web: "ok", worker: h });
  } catch (err) {
    return NextResponse.json(
      { web: "ok", worker: null, error: String(err) },
      { status: 503 }
    );
  }
}
