"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { TrackDownloadMenu } from "@/components/track-download-menu";

type MusicTrack = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  mp3Url: string | null;
  mp4Url?: string | null;
  latestVideoId?: string | null;
  downloadAvailableAt: string;
};

type MusicItem = {
  id: string;
  title: string | null;
  lyrics: string;
  isMr?: boolean;
  stylePrompt: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  errorMessage: string | null;
  tracks: MusicTrack[];
  hiddenBonusTrackCount: number;
  canUnlockBonusTrack: boolean;
  bonusUnlockExpiresAt: string | null;
  bonusUnlockCost: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

async function readJson(response: Response) {
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  }

  return data;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarizeTitle(item: MusicItem) {
  const base = item.title?.trim() || item.lyrics.replace(/\s+/g, " ").trim();
  return base.length > 28 ? `${base.slice(0, 28)}...` : base;
}

function formatRemainingDownloadTime(value: string) {
  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "다운로드 가능";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (minutes > 0) {
    return `${minutes}분 ${seconds}초 후`;
  }

  return `${seconds}초 후`;
}

function formatRemainingDownloadTimeFromNow(targetTime: string, now: number) {
  const remainingMs = new Date(targetTime).getTime() - now;

  if (remainingMs <= 0) {
    return "다운로드 가능";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} 후`;
}

function buildTrackPlaybackUrl(trackId: string) {
  return `/api/music/${trackId}/download?inline=1`;
}

export default function MusicHistoryPage() {
  const [items, setItems] = useState<MusicItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState("목록을 불러오는 중입니다...");
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);

  async function loadPage(page: number) {
    const response = await fetch(`/api/music?page=${page}&limit=20`, {
      method: "GET",
      credentials: "include",
    });

    const data = (await readJson(response)) as { items: MusicItem[]; pagination: Pagination };
    setItems(data.items);
    setPagination(data.pagination);
    setMessage(data.items.length === 0 ? "표시할 음악이 없습니다." : "");
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    startTransition(async () => {
      try {
        await loadPage(1);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
      }
    });
  }, []);

  function movePage(nextPage: number) {
    startTransition(async () => {
      try {
        await loadPage(nextPage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
      }
    });
  }

  function unlockBonusTrack(musicId: string) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/music/${musicId}/unlock-bonus`, {
          method: "POST",
          credentials: "include",
        });

        await readJson(response);
        await loadPage(pagination.page);
        setMessage("추가곡을 열었습니다.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "추가곡을 열지 못했습니다.");
      }
    });
  }

  function toggleTrackPlayback(trackId: string) {
    if (playingTrackId === trackId) {
      setPlayingTrackId(null);
      setPlayingTrackUrl(null);
      return;
    }

    setPlayingTrackId(trackId);
    setPlayingTrackUrl(buildTrackPlaybackUrl(trackId));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6">
      <div className="rounded-[1.8rem] border border-[var(--border)] bg-white/92 p-6 shadow-[0_18px_50px_rgba(90,55,30,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Music History
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#2d2018]">전체 음악 리스트</h1>
            <p className="mt-2 text-sm text-[#6b5648]">최근 생성한 음악 20개씩 확인할 수 있습니다.</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-4 py-2 text-sm font-semibold text-[#5a4336]"
          >
            메인으로 돌아가기
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.2rem] border border-[var(--border)]">
          <div className="grid grid-cols-[96px_minmax(0,1fr)_170px] gap-3 bg-[#f8f3eb] px-4 py-3 text-xs font-semibold text-[#6b5648] sm:grid-cols-[120px_minmax(0,1fr)_260px]">
            <span>시간</span>
            <span>제목</span>
            <span>다운</span>
          </div>

          <div className="divide-y divide-[var(--border)] bg-white">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6b5648]">{message}</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-4 py-3 text-sm text-[#3f2f25]">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)_170px] gap-3 sm:grid-cols-[120px_minmax(0,1fr)_260px]">
                    <span className="text-xs text-[#8a7465]">{formatDate(item.createdAt)}</span>
                    <span className="truncate font-medium">{summarizeTitle(item)}</span>
                      <div className="flex flex-wrap gap-2">
                        {item.tracks.map((track, index) =>
                          track.mp3Url ? (
                            <div key={track.id} className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => toggleTrackPlayback(track.id)}
                                className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#4e3b30]"
                              >
                              {playingTrackId === track.id ? `닫기${index + 1}` : `듣기${index + 1}`}
                            </button>
                            {new Date(track.downloadAvailableAt).getTime() <= nowTs ? (
                              <>
                                <TrackDownloadMenu
                                  trackId={track.id}
                                  trackIndex={index + 1}
                                  mp4Url={track.mp4Url}
                                  latestVideoId={track.latestVideoId}
                                  title={item.title ?? "제목 없는 곡"}
                                  lyrics={item.lyrics}
                                  isMr={item.isMr}
                                  onCompleted={() => loadPage(pagination.page)}
                                />
                              </>
                            ) : (
                              <span
                                className="rounded-full border border-[var(--border)] bg-[#f7f2eb] px-3 py-1.5 text-[11px] text-[#8a7465]"
                              >
                                {formatRemainingDownloadTimeFromNow(track.downloadAvailableAt, nowTs)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            key={track.id}
                            className="rounded-full border border-[var(--border)] bg-[#f7f2eb] px-3 py-1.5 text-[11px] text-[#8a7465]"
                          >
                            준비중 {index + 1}
                          </span>
                        ),
                      )}
                      {item.canUnlockBonusTrack ? (
                        <button
                          type="button"
                          onClick={() => unlockBonusTrack(item.id)}
                          disabled={isPending}
                          className="rounded-full border border-[var(--accent)] bg-[#fff1eb] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent)] disabled:opacity-60"
                        >
                          추가곡생성 {item.bonusUnlockCost}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {playingTrackId && item.tracks.some((track) => track.id === playingTrackId) && playingTrackUrl ? (
                    <div className="mt-3 rounded-[1rem] border border-[var(--border)] bg-[#f8f3eb] px-3 py-3">
                      <p className="mb-2 text-[11px] font-semibold text-[#6b5648]">현재 재생</p>
                      <audio
                        key={playingTrackId}
                        controls
                        autoPlay
                        preload="metadata"
                        src={playingTrackUrl}
                        className="w-full"
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-[#8a7465]">
            페이지 {pagination.page} / {pagination.totalPages} · 전체 {pagination.total}건
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => movePage(pagination.page - 1)}
              disabled={isPending || pagination.page <= 1}
              className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-4 py-2 text-xs font-semibold text-[#5a4336] disabled:opacity-50"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => movePage(pagination.page + 1)}
              disabled={isPending || pagination.page >= pagination.totalPages}
              className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-4 py-2 text-xs font-semibold text-[#5a4336] disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
