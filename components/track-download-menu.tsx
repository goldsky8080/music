"use client";

import { useState } from "react";
import { VideoRenderControls } from "@/components/video-render-controls";

type TrackDownloadMenuProps = {
  trackId: string;
  trackIndex: number;
  mp4Url?: string | null;
  latestVideoId?: string | null;
  title: string;
  lyrics: string;
  isMr?: boolean;
  onCompleted?: () => Promise<void> | void;
};

export function TrackDownloadMenu({
  trackId,
  trackIndex,
  mp4Url,
  latestVideoId,
  title,
  lyrics,
  isMr = false,
  onCompleted,
}: TrackDownloadMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-white"
      >
        다운로드 {trackIndex}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-md rounded-[1.4rem] border border-[var(--border)] bg-[#fffdf9] p-5 shadow-[0_24px_80px_rgba(40,22,12,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Download
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#2d2018]">트랙 {trackIndex} 다운로드</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[#6b5648]"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <a
                href={`/api/music/${trackId}/download`}
                className="rounded-[1rem] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[#4e3b30]"
              >
                오디오 다운로드
              </a>

              <a
                href={`/api/music/${trackId}/lyrics`}
                className="rounded-[1rem] border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[#4e3b30]"
              >
                가사 txt 다운로드
              </a>

              <div className="rounded-[1rem] border border-[var(--border)] bg-[#fffaf4] p-3">
                <p className="mb-3 text-xs font-semibold text-[#7b604e]">비디오 만들기</p>
                <VideoRenderControls
                  musicId={trackId}
                  trackIndex={trackIndex}
                  mp4Url={mp4Url}
                  latestVideoId={latestVideoId}
                  title={title}
                  isMr={isMr}
                  onCompleted={onCompleted}
                />
              </div>

              <button
                type="button"
                onClick={() => window.alert("MR 분리 기능은 다음 단계에서 연결할 예정입니다.")}
                className="rounded-[1rem] border border-[var(--border)] bg-[#f7f2eb] px-4 py-3 text-left text-sm font-semibold text-[#8a7465]"
              >
                MR +100
                <span className="ml-2 text-xs font-medium">준비중</span>
              </button>
            </div>

            <p className="mt-4 line-clamp-3 text-xs leading-6 text-[#8a7465]">
              가사 미리보기 · {lyrics.replace(/\s+/g, " ")}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
