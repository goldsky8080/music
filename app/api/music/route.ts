import { NextRequest, NextResponse } from "next/server";
import { MusicStatus, QueueStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { consumeMusicGenerationCredits, refundMusicGenerationCredits } from "@/server/credits/service";
import {
  ADDITIONAL_TRACK_UNLOCK_COST,
  BONUS_TRACK_UNLOCK_WINDOW_DAYS,
  DOWNLOAD_DELAY_MS,
  getMusicGenerationCost,
} from "@/server/music/constants";
import { getMusicProvider } from "@/server/music/provider";
import { createMusicSchema } from "@/server/music/schema";
import { syncMusicStatuses } from "@/server/music/service";

function toDbMusicStatus(status: "queued" | "processing" | "completed" | "failed") {
  switch (status) {
    case "queued":
      return MusicStatus.QUEUED;
    case "processing":
      return MusicStatus.PROCESSING;
    case "completed":
      return MusicStatus.COMPLETED;
    case "failed":
      return MusicStatus.FAILED;
    default:
      return MusicStatus.QUEUED;
  }
}

function toDbQueueStatus(status: "queued" | "processing" | "completed" | "failed") {
  switch (status) {
    case "queued":
      return QueueStatus.QUEUED;
    case "processing":
      return QueueStatus.ACTIVE;
    case "completed":
      return QueueStatus.COMPLETED;
    case "failed":
      return QueueStatus.FAILED;
    default:
      return QueueStatus.QUEUED;
  }
}

type MusicRow = Awaited<ReturnType<typeof db.music.findMany>>[number] & {
  videos: Array<{
    id: string;
    mp4Url: string | null;
    createdAt: Date;
  }>;
  generationJobs: Array<{
    payload: unknown;
    result: unknown;
    updatedAt: Date;
  }>;
};

const BONUS_TRACK_UNLOCK_WINDOW_MS = BONUS_TRACK_UNLOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function readGenerationContext(track: MusicRow) {
  const latestJob = [...track.generationJobs].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const payload =
    latestJob?.payload && typeof latestJob.payload === "object"
      ? (latestJob.payload as Record<string, unknown>)
      : null;
  const result =
    latestJob?.result && typeof latestJob.result === "object"
      ? (latestJob.result as Record<string, unknown>)
      : null;

  return {
    title: typeof payload?.title === "string" && payload.title.trim().length > 0 ? payload.title.trim() : null,
    lyricMode: typeof payload?.lyricMode === "string" ? payload.lyricMode : null,
    generatedLyrics:
      typeof result?.generatedLyrics === "string" && result.generatedLyrics.trim().length > 0
        ? result.generatedLyrics
        : typeof result?.providerPrompt === "string" && result.providerPrompt.trim().length > 0
          ? result.providerPrompt
          : null,
    providerDescriptionPrompt:
      typeof result?.providerDescriptionPrompt === "string" ? result.providerDescriptionPrompt : null,
  };
}

function buildDisplayTitle(input: {
  storedTitle: string | null;
  generatedLyrics: string | null;
  requestLyrics: string;
  stylePrompt: string;
  lyricMode: string | null;
}) {
  const storedTitle = input.storedTitle?.trim();

  if (storedTitle && storedTitle !== "자동") {
    return storedTitle;
  }

  const lyricSource = input.generatedLyrics?.trim() || (input.lyricMode === "manual" ? input.requestLyrics.trim() : "");
  if (lyricSource) {
    const lines = lyricSource
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^\[[^\]]+\]$/.test(line));
    const firstLine = lines[0];

    if (firstLine) {
      return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
    }
  }

  const styleParts = input.stylePrompt
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (styleParts.length > 0) {
    return styleParts.join(" · ");
  }

  return "제목 없는 곡";
}

function summarizeGroupStatus(statuses: MusicStatus[]) {
  if (statuses.some((status) => status === MusicStatus.PROCESSING)) {
    return MusicStatus.PROCESSING;
  }

  if (statuses.some((status) => status === MusicStatus.QUEUED)) {
    return MusicStatus.QUEUED;
  }

  if (statuses.every((status) => status === MusicStatus.COMPLETED)) {
    return MusicStatus.COMPLETED;
  }

  if (statuses.some((status) => status === MusicStatus.COMPLETED)) {
    return MusicStatus.COMPLETED;
  }

  if (statuses.some((status) => status === MusicStatus.FAILED)) {
    return MusicStatus.FAILED;
  }

  return statuses[0] ?? MusicStatus.QUEUED;
}

function groupMusicItems(musics: MusicRow[]) {
  const groups = new Map<string, MusicRow[]>();

  for (const music of musics) {
    const groupKey = music.requestGroupId ?? music.id;
    const current = groups.get(groupKey) ?? [];
    current.push(music);
    groups.set(groupKey, current);
  }

  return Array.from(groups.entries())
    .map(([groupId, tracks]) => {
      const sortedTracks = [...tracks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const first = sortedTracks[0];
      const generationContext = readGenerationContext(first);
      const statuses = sortedTracks.map((track) => track.status);
      const errorMessage = sortedTracks.find((track) => track.errorMessage)?.errorMessage ?? null;
      const hiddenBonusTracks = sortedTracks.filter(
        (track) => track.isBonusTrack && !track.bonusUnlockedAt,
      );
      const visibleTracks = sortedTracks.filter(
        (track) => !track.isBonusTrack || Boolean(track.bonusUnlockedAt),
      );
      const bonusUnlockExpiresAt = new Date(first.createdAt.getTime() + BONUS_TRACK_UNLOCK_WINDOW_MS);
      const canUnlockBonusTrack =
        hiddenBonusTracks.length > 0 && bonusUnlockExpiresAt.getTime() > Date.now();

      const effectiveLyrics =
        generationContext.generatedLyrics ??
        (generationContext.lyricMode === "manual" ? first.lyrics : "실제 가사를 준비 중입니다.");
      const displayTitle = buildDisplayTitle({
        storedTitle: generationContext.title,
        generatedLyrics: generationContext.generatedLyrics,
        requestLyrics: first.lyrics,
        stylePrompt: first.stylePrompt,
        lyricMode: generationContext.lyricMode,
      });

      return {
        id: groupId,
        title: displayTitle,
        lyrics: effectiveLyrics,
        isMr: first.isMr,
        requestLyrics: first.lyrics,
        generatedLyrics: generationContext.generatedLyrics,
        lyricMode: generationContext.lyricMode,
        stylePrompt: first.stylePrompt,
        status: summarizeGroupStatus(statuses),
        createdAt: first.createdAt,
        errorMessage,
        tracks: visibleTracks.map((track) => {
          const latestVideo = [...track.videos]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .find((video) => Boolean(video.mp4Url));

          return {
            id: track.id,
            status: track.status,
            mp3Url: track.mp3Url,
            mp4Url: latestVideo?.mp4Url ?? null,
            latestVideoId: latestVideo?.id ?? null,
            downloadAvailableAt: new Date(track.createdAt.getTime() + DOWNLOAD_DELAY_MS),
          };
        }),
        hiddenBonusTrackCount: hiddenBonusTracks.length,
        canUnlockBonusTrack,
        bonusUnlockExpiresAt: hiddenBonusTracks.length > 0 ? bonusUnlockExpiresAt : null,
        bonusUnlockCost: hiddenBonusTracks.length > 0 ? ADDITIONAL_TRACK_UNLOCK_COST : 0,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncMusicStatuses(sessionUser.id);

  const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 50;
  const skip = (safePage - 1) * safeLimit;

  const musics = await db.music.findMany({
    where: {
      userId: sessionUser.id,
    },
    include: {
      videos: {
        select: {
          id: true,
          mp4Url: true,
          createdAt: true,
        },
      },
      generationJobs: {
        where: {
          jobType: "MUSIC_GENERATION",
        },
        select: {
          payload: true,
          result: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  const grouped = groupMusicItems(musics);
  const visibleItems = grouped.filter((item) => item.status !== MusicStatus.FAILED);
  const pagedItems = visibleItems.slice(skip, skip + safeLimit);

  return NextResponse.json({
    items: pagedItems,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: visibleItems.length,
      totalPages: Math.max(1, Math.ceil(visibleItems.length / safeLimit)),
    },
  });
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createMusicSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const provider = getMusicProvider();
  const trackCount = 1 as const;
  const requestGroupId = crypto.randomUUID();
  const generationCost = getMusicGenerationCost(trackCount);

  let created;

  try {
    created = await db.$transaction(async (tx) => {
      const music = await tx.music.create({
        data: {
          userId: sessionUser.id,
          requestGroupId,
          lyrics: parsed.data.lyrics,
          stylePrompt: parsed.data.stylePrompt,
          isMr: parsed.data.isMr,
          provider: "SONGS",
          status: "QUEUED",
        },
      });

      await consumeMusicGenerationCredits(sessionUser.id, music.id, trackCount, tx);

      await tx.generationJob.create({
        data: {
          userId: sessionUser.id,
          musicId: music.id,
          targetType: "MUSIC",
          jobType: "MUSIC_GENERATION",
          queueStatus: "QUEUED",
          payload: {
            title: parsed.data.title,
            lyrics: parsed.data.lyrics,
            stylePrompt: parsed.data.stylePrompt,
            lyricMode: parsed.data.lyricMode,
            isMr: parsed.data.isMr,
            vocalGender: parsed.data.vocalGender,
            trackCount,
            modelVersion: parsed.data.modelVersion,
            cost: generationCost,
          },
        },
      });

      return music;
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Music generation request failed.";
    const status = errorMessage.includes("크레딧이 부족") ? 402 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }

  try {
    const providerResult = await provider.createMusic({
      userId: sessionUser.id,
      title: parsed.data.title,
      lyrics: parsed.data.lyrics,
      stylePrompt: parsed.data.stylePrompt,
      lyricMode: parsed.data.lyricMode,
      isMr: parsed.data.isMr,
      vocalGender: parsed.data.vocalGender,
      trackCount,
      modelVersion: parsed.data.modelVersion,
    });
    const tracks =
      providerResult.tracks && providerResult.tracks.length > 0
        ? providerResult.tracks
        : [
            {
              providerTaskId: providerResult.providerTaskId,
              status: providerResult.status,
              mp3Url: providerResult.mp3Url,
              videoUrl: providerResult.videoUrl,
            },
          ];

    const selectedTracks = tracks.slice(0, 2);

    const [primaryTrack, ...extraTracks] = selectedTracks;

      const items = await db.$transaction(async (tx) => {
      const primaryMusic = await tx.music.update({
        where: { id: created.id },
        data: {
          providerTaskId: primaryTrack.providerTaskId,
          status: toDbMusicStatus(primaryTrack.status),
          mp3Url: primaryTrack.mp3Url ?? null,
          errorMessage: providerResult.errorMessage ?? null,
          videos: primaryTrack.videoUrl
            ? {
                create: {
                  mp4Url: primaryTrack.videoUrl,
                  status: "COMPLETED",
                },
              }
            : undefined,
        },
      });

      await tx.generationJob.updateMany({
        where: {
          musicId: created.id,
          jobType: "MUSIC_GENERATION",
        },
        data: {
          queueStatus: toDbQueueStatus(primaryTrack.status),
              result: {
                providerTaskId: primaryTrack.providerTaskId,
                status: primaryTrack.status,
                mp3Url: primaryTrack.mp3Url ?? null,
                videoUrl: primaryTrack.videoUrl ?? null,
                generatedLyrics: primaryTrack.generatedLyrics ?? null,
                providerPrompt: primaryTrack.providerPrompt ?? null,
                providerDescriptionPrompt: primaryTrack.providerDescriptionPrompt ?? null,
          },
          errorMessage: providerResult.errorMessage ?? null,
        },
      });

      const extraMusics = await Promise.all(
        extraTracks.map(async (track) => {
          const music = await tx.music.create({
            data: {
              userId: sessionUser.id,
              requestGroupId,
              lyrics: parsed.data.lyrics,
              stylePrompt: parsed.data.stylePrompt,
              provider: "SONGS",
              providerTaskId: track.providerTaskId,
              isMr: parsed.data.isMr,
              isBonusTrack: true,
              status: toDbMusicStatus(track.status),
              mp3Url: track.mp3Url ?? null,
              errorMessage: providerResult.errorMessage ?? null,
              videos: track.videoUrl
                ? {
                    create: {
                      mp4Url: track.videoUrl,
                      status: "COMPLETED",
                    },
                  }
                : undefined,
            },
          });

          await tx.generationJob.create({
            data: {
              userId: sessionUser.id,
              musicId: music.id,
              targetType: "MUSIC",
              jobType: "MUSIC_GENERATION",
              queueStatus: toDbQueueStatus(track.status),
              payload: {
                title: parsed.data.title,
                lyrics: parsed.data.lyrics,
                stylePrompt: parsed.data.stylePrompt,
                lyricMode: parsed.data.lyricMode,
                isMr: parsed.data.isMr,
                vocalGender: parsed.data.vocalGender,
                trackCount: 1,
                modelVersion: parsed.data.modelVersion,
                cost: 0,
                source: "provider-bonus-track",
              },
              result: {
                providerTaskId: track.providerTaskId,
                status: track.status,
                mp3Url: track.mp3Url ?? null,
                videoUrl: track.videoUrl ?? null,
                generatedLyrics: track.generatedLyrics ?? null,
                providerPrompt: track.providerPrompt ?? null,
                providerDescriptionPrompt: track.providerDescriptionPrompt ?? null,
              },
              errorMessage: providerResult.errorMessage ?? null,
            },
          });

          return music;
        }),
      );

      return [primaryMusic.id, ...extraMusics.map((music) => music.id)];
    });

    const createdItems = await db.music.findMany({
      where: {
        id: {
          in: items,
        },
      },
      include: {
        videos: {
          select: {
            id: true,
            mp4Url: true,
            createdAt: true,
          },
        },
        generationJobs: {
          where: {
            jobType: "MUSIC_GENERATION",
          },
          select: {
            payload: true,
            result: true,
            updatedAt: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({ items: groupMusicItems(createdItems) }, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Music generation request failed.";

    await refundMusicGenerationCredits(sessionUser.id, created.id);

    await db.$transaction([
      db.music.update({
        where: { id: created.id },
        data: {
          status: MusicStatus.FAILED,
          errorMessage,
        },
      }),
      db.generationJob.updateMany({
        where: {
          musicId: created.id,
          jobType: "MUSIC_GENERATION",
        },
        data: {
          queueStatus: QueueStatus.FAILED,
          errorMessage,
        },
      }),
    ]);

    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}

