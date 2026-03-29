import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const GENERATED_VIDEO_DIR = path.join(process.cwd(), "public", "generated-videos");

function toReadableStream(filePath: string) {
  const nodeStream = createReadStream(filePath);
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        controller.enqueue(new Uint8Array(buffer));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const videoId = new URL(request.url).searchParams.get("videoId");

  const music = await db.music.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!music || music.userId !== sessionUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const video = await db.video.findFirst({
    where: {
      musicId: music.id,
      ...(videoId ? { id: videoId } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      mp4Url: true,
      status: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "비디오를 찾을 수 없습니다." }, { status: 404 });
  }

  if (video.status !== "COMPLETED" || !video.mp4Url) {
    return NextResponse.json({ error: "비디오가 아직 준비되지 않았습니다." }, { status: 409 });
  }

  const fileName = path.basename(video.mp4Url);
  const filePath = path.join(GENERATED_VIDEO_DIR, fileName);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "비디오 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  return new NextResponse(toReadableStream(filePath), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
