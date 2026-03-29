"use client";

import { useEffect, useRef, useState } from "react";

type VideoRenderControlsProps = {
  musicId: string;
  trackIndex: number;
  mp4Url: string | null | undefined;
  latestVideoId?: string | null;
  title: string;
  isMr?: boolean;
  onCompleted?: () => Promise<void> | void;
};

const BASE_VIDEO_COST = 100;
const LYRICS_VIDEO_COST = 300;

async function readJson(response: Response) {
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  }

  return data;
}

function shortenFileName(name: string) {
  return name.length > 12 ? `${name.slice(0, 12)}...` : name;
}

function triggerDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function buildVideoDownloadUrl(musicId: string, videoId?: string | null) {
  const query = videoId ? `?videoId=${encodeURIComponent(videoId)}` : "";
  return `/api/music/${musicId}/video-file${query}`;
}

export function VideoRenderControls({
  musicId,
  trackIndex,
  mp4Url,
  latestVideoId,
  title,
  isMr = false,
  onCompleted,
}: VideoRenderControlsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const onCompletedRef = useRef<VideoRenderControlsProps["onCompleted"]>(onCompleted);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [renderingVideoId, setRenderingVideoId] = useState<string | null>(null);

  const videoCost = showLyrics ? LYRICS_VIDEO_COST : BASE_VIDEO_COST;

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    if (isMr && showLyrics) {
      setShowLyrics(false);
    }
  }, [isMr, showLyrics]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
      }
      if (pollingTimerRef.current !== null) {
        window.clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  function chooseImage() {
    inputRef.current?.click();
  }

  function startProgress() {
    setProgress(8);
    setStatusText("비디오 렌더링을 준비하고 있습니다.");

    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
    }

    progressTimerRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current < 28) {
          setStatusText("커버 이미지를 불러오는 중입니다.");
          return current + 4;
        }

        if (current < 56) {
          setStatusText(showLyrics ? "가사와 제목을 합성하는 중입니다." : "비디오 프레임을 만드는 중입니다.");
          return current + 3;
        }

        if (current < 82) {
          setStatusText("영상 인코딩을 진행하고 있습니다.");
          return current + 2;
        }

        if (current < 94) {
          setStatusText("마무리 렌더링 중입니다.");
          return current + 1;
        }

        return current;
      });
    }, 700);
  }

  function stopProgress() {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function stopPolling() {
    if (pollingTimerRef.current !== null) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!isRendering || !renderingVideoId) {
      stopPolling();
      return;
    }

    async function pollStatus() {
      try {
        const response = await fetch(`/api/music/${musicId}/video?videoId=${renderingVideoId}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = await readJson(response);
        const item =
          data.item && typeof data.item === "object" ? (data.item as Record<string, unknown>) : null;

        if (!item) {
          return;
        }

        const status = typeof item.status === "string" ? item.status : null;
        const nextMp4Url = typeof item.mp4Url === "string" ? item.mp4Url : null;
        const errorMessage = typeof item.errorMessage === "string" ? item.errorMessage : null;

        await onCompletedRef.current?.();

        if (status === "COMPLETED" && nextMp4Url) {
          stopPolling();
          stopProgress();
          setProgress(100);
          setStatusText("완료되었습니다. 비디오를 다운로드합니다.");
          setSelectedFile(null);
          setRenderingVideoId(null);
          if (inputRef.current) {
            inputRef.current.value = "";
          }
          triggerDownload(buildVideoDownloadUrl(musicId, renderingVideoId));
          window.setTimeout(() => {
            setIsRendering(false);
            setProgress(0);
            setStatusText(null);
          }, 1200);
          return;
        }

        if (status === "FAILED") {
          stopPolling();
          stopProgress();
          setIsRendering(false);
          setRenderingVideoId(null);
          setProgress(0);
          setStatusText(null);
          window.alert(errorMessage ?? "비디오 생성에 실패했습니다.");
        }
      } catch (error) {
        stopPolling();
        stopProgress();
        setIsRendering(false);
        setRenderingVideoId(null);
        setProgress(0);
        setStatusText(null);
        window.alert(error instanceof Error ? error.message : "비디오 상태를 확인하지 못했습니다.");
      }
    }

    void pollStatus();
    pollingTimerRef.current = window.setInterval(() => {
      void pollStatus();
    }, 4000);

    return () => {
      stopPolling();
    };
  }, [isRendering, renderingVideoId, musicId]);

  function handleCreateVideo() {
    setIsRendering(true);
    startProgress();

    void (async () => {
      try {
        const formData = new FormData();

        if (selectedFile) {
          formData.append("image", selectedFile);
        }

        formData.append("showLyrics", showLyrics ? "true" : "false");
        formData.append("showTitle", showTitle ? "true" : "false");
        formData.append("titleText", title);

        const response = await fetch(`/api/music/${musicId}/video`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        const data = await readJson(response);
        const item =
          data.item && typeof data.item === "object" ? (data.item as Record<string, unknown>) : null;
        const nextVideoId = typeof item?.id === "string" ? item.id : null;

        if (!nextVideoId) {
          throw new Error("비디오 작업 정보를 받지 못했습니다.");
        }

        setRenderingVideoId(nextVideoId);
        setStatusText("비디오 생성이 접수되었습니다. 완료 여부를 확인하는 중입니다.");
        setProgress((current) => Math.max(current, 18));
      } catch (error) {
        stopPolling();
        stopProgress();
        setIsRendering(false);
        setRenderingVideoId(null);
        setProgress(0);
        setStatusText(null);
        window.alert(error instanceof Error ? error.message : "비디오 생성에 실패했습니다.");
      }
    })();
  }

  return (
    <div className="flex w-full flex-wrap gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const nextFile = event.target.files?.[0] ?? null;
          setSelectedFile(nextFile);
        }}
      />
      <button
        type="button"
        onClick={chooseImage}
        className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[11px] font-semibold text-[#4e3b30]"
      >
        {selectedFile ? shortenFileName(selectedFile.name) : "이미지선택"}
      </button>
      <button
        type="button"
        onClick={handleCreateVideo}
        disabled={isRendering}
        className="rounded-full border border-[var(--accent)] bg-[#fff1eb] px-3 py-2 text-[11px] font-semibold text-[var(--accent)] disabled:opacity-50"
      >
        {isRendering
          ? `비디오 생성중 ${progress}%`
          : selectedFile
            ? `비디오+${videoCost}`
            : `커버로 비디오+${videoCost}`}
      </button>
      {mp4Url ? (
        <a
          href={buildVideoDownloadUrl(musicId, latestVideoId)}
          download
          className="rounded-full bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white"
        >
          비디오 {trackIndex}
        </a>
      ) : null}

      <label className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[11px] font-semibold text-[#4e3b30]">
        <input
          type="checkbox"
          checked={showLyrics}
          disabled={isMr}
          onChange={(event) => setShowLyrics(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        가사 표시
      </label>
      <label className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[11px] font-semibold text-[#4e3b30]">
        <input
          type="checkbox"
          checked={showTitle}
          onChange={(event) => setShowTitle(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        제목 표시
      </label>

      {isRendering || progress > 0 ? (
        <div className="w-full rounded-[1rem] border border-[var(--border)] bg-white/80 px-3 py-3">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[#6f5849]">
            <span>{statusText ?? "비디오를 준비하고 있습니다."}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f3e4da]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
