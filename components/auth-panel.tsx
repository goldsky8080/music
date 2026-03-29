"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { TrackDownloadMenu } from "@/components/track-download-menu";

type VocalGender = "auto" | "female" | "male";
type LyricMode = "manual" | "ai_lyrics" | "auto";
type ModelVersion = "v4_5_plus" | "v5" | "v5_5";
type AutoLyricTopic = "love" | "hometown" | "family" | "life" | "comfort";
type AutoLyricSituation = "separation" | "memory" | "hardship" | "late_night" | "hope";
type AutoLyricEmotion = "yearning" | "regret" | "warmth" | "lonely" | "hopeful";
type AutoLyricWording = "easy" | "popular" | "poetic";
type AutoLyricHook = "strong" | "gentle";
type AutoLyricGenre = "trot" | "ballad" | "dance" | "pop";
type AutoLyricTempo = "slow" | "medium" | "fast";
type AutoLyricInstrument = "guitar" | "piano" | "strings" | "synth";
type AutoLyricToggleKey =
  | "topic"
  | "situation"
  | "emotion"
  | "wording"
  | "hook"
  | "genre"
  | "tempo"
  | "instrument";

type PublicUser = {
  id: string;
  email: string;
  freeCredits: number;
  paidCredits: number;
  totalCredits: number;
  tier: string | null;
  role: "USER" | "DEVELOPER" | "ADMIN";
};

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

type AuthPanelProps = {
  showAllMusicList?: boolean;
};

async function readJson(response: Response) {
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  }

  return data;
}

function formatCredits(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: MusicItem["status"]) {
  switch (status) {
    case "QUEUED":
      return "대기 중";
    case "PROCESSING":
      return "생성 중";
    case "COMPLETED":
      return "완료";
    case "FAILED":
      return "실패";
    case "CANCELLED":
      return "취소됨";
    default:
      return status;
  }
}

function statusTone(status: MusicItem["status"]) {
  switch (status) {
    case "COMPLETED":
      return "bg-[#eef8f1] text-[#1c6a42]";
    case "FAILED":
      return "bg-[#fff0eb] text-[#b64822]";
    case "PROCESSING":
      return "bg-[#fff6e6] text-[#9a5b09]";
    default:
      return "bg-[#f4efe8] text-[#6b5648]";
  }
}

function summarizeMusicLabel(item: MusicItem) {
  const base = item.title?.trim() || item.lyrics.replace(/\s+/g, " ").trim();
  return base.length > 34 ? `${base.slice(0, 34)}...` : base;
}

function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
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
    return `${minutes}분 ${seconds}초 후 다운로드`;
  }

  return `${seconds}초 후 다운로드`;
}

function formatRemainingDownloadTimeFromNow(targetTime: string, now: number) {
  const remainingMs = new Date(targetTime).getTime() - now;

  if (remainingMs <= 0) {
    return "다운로드 가능";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} 후 다운로드`;
}

function buildTrackPlaybackUrl(trackId: string) {
  return `/api/music/${trackId}/download?inline=1`;
}

const MUSIC_GENERATION_COST = 500;

const autoLyricOptionLabels = {
  topic: {
    love: "사랑",
    hometown: "고향",
    family: "가족",
    life: "인생",
    comfort: "위로",
  },
  situation: {
    separation: "이별 후",
    memory: "추억 회상",
    hardship: "힘든 현실",
    late_night: "늦은 밤",
    hope: "다시 시작",
  },
  emotion: {
    yearning: "그리움",
    regret: "후회",
    warmth: "따뜻함",
    lonely: "외로움",
    hopeful: "희망",
  },
  wording: {
    easy: "쉬운 표현",
    popular: "대중적인 표현",
    poetic: "조금 시적인 표현",
  },
  hook: {
    strong: "후렴 강조",
    gentle: "잔잔한 전개",
  },
  genre: {
    trot: "트로트",
    ballad: "발라드",
    dance: "댄스",
    pop: "팝",
  },
  tempo: {
    slow: "느리게",
    medium: "중간",
    fast: "빠르게",
  },
  instrument: {
    guitar: "기타",
    piano: "피아노",
    strings: "스트링",
    synth: "신스",
  },
} as const;

function buildAutoLyricPrompt(input: {
  topic: AutoLyricTopic;
  situation: AutoLyricSituation;
  emotion: AutoLyricEmotion;
  wording: AutoLyricWording;
  hook: AutoLyricHook;
  genre: AutoLyricGenre;
  tempo: AutoLyricTempo;
  instrument: AutoLyricInstrument;
  vocalGender: VocalGender;
  stylePrompt: string;
  enabled: Record<AutoLyricToggleKey, boolean>;
}) {
  const topicMap: Record<AutoLyricTopic, string> = {
    love: "사랑과 이별",
    hometown: "고향과 지난 시절",
    family: "가족과 부모님",
    life: "인생의 굴곡과 세월",
    comfort: "지친 마음을 위로하는 이야기",
  };
  const situationMap: Record<AutoLyricSituation, string> = {
    separation: "떠나간 사람이나 지나간 시간을 돌아보는 상황으로",
    memory: "지난 시절을 떠올리며 회상하는 장면으로",
    hardship: "힘든 현실을 버티는 사람의 독백처럼",
    late_night: "늦은 밤 혼자 감정을 꺼내는 분위기로",
    hope: "다시 일어서려는 마음이 느껴지게",
  };
  const emotionMap: Record<AutoLyricEmotion, string> = {
    yearning: "그리움이 짙게 느껴지게",
    regret: "후회가 묻어나는 감정으로",
    warmth: "따뜻하고 정감 있게",
    lonely: "외롭고 쓸쓸한 결로",
    hopeful: "희망을 잃지 않는 느낌으로",
  };
  const wordingMap: Record<AutoLyricWording, string> = {
    easy: "쉬운 한국어 표현 위주로",
    popular: "대중적이고 바로 귀에 들어오는 말투로",
    poetic: "조금 시적이지만 과하지 않게",
  };
  const hookMap: Record<AutoLyricHook, string> = {
    strong: "후렴은 한 번 들으면 기억나는 식으로 강하게 써줘.",
    gentle: "후렴은 잔잔하게 반복되도록 써줘.",
  };
  const genreMap: Record<AutoLyricGenre, string> = {
    trot: "트로트",
    ballad: "발라드",
    dance: "댄스",
    pop: "팝",
  };
  const tempoMap: Record<AutoLyricTempo, string> = {
    slow: "느린 템포로",
    medium: "중간 템포로",
    fast: "빠른 템포로",
  };
  const instrumentMap: Record<AutoLyricInstrument, string> = {
    guitar: "기타가 중심이 되게",
    piano: "피아노 중심으로",
    strings: "스트링이 살아나게",
    synth: "신스 질감을 살려",
  };

  const singerText =
    input.vocalGender === "female"
      ? "여성 보컬이 자연스럽게 부를 수 있도록"
      : input.vocalGender === "male"
        ? "남성 보컬이 자연스럽게 부를 수 있도록"
        : "보컬 성별이 자연스럽게 느껴지도록";

  const styleText = input.stylePrompt.trim()
    ? `${input.stylePrompt.trim()} 느낌을 살리고`
    : "장르 분위기에 어울리게";

  const genreText = input.enabled.genre ? `${genreMap[input.genre]} 느낌으로 ` : "";
  const tempoText = input.enabled.tempo ? `${tempoMap[input.tempo]} ` : "";
  const instrumentText = input.enabled.instrument ? `${instrumentMap[input.instrument]} 편곡으로 ` : "";
  const topicText = input.enabled.topic ? topicMap[input.topic] : "감정이 살아 있는 이야기";
  const situationText = input.enabled.situation
    ? situationMap[input.situation]
    : "자연스럽게 장면이 떠오르도록";
  const emotionText = input.enabled.emotion
    ? emotionMap[input.emotion]
    : "감정선이 분명하게 느껴지게";
  const wordingText = input.enabled.wording
    ? wordingMap[input.wording]
    : "자연스럽고 듣기 편한 표현으로";
  const hookText = input.enabled.hook
    ? hookMap[input.hook]
    : "후렴은 곡 흐름에 자연스럽게 어울리게 써줘.";

  return `${topicText}를 바탕으로, ${situationText} ${emotionText} 가사를 만들어줘. ${genreText}${tempoText}${instrumentText}${wordingText} ${styleText}, ${singerText} 써줘. ${hookText}`;
}

function buildAutoStylePrompt(input: {
  genre: AutoLyricGenre;
  tempo: AutoLyricTempo;
  instrument: AutoLyricInstrument;
  emotion: AutoLyricEmotion;
  vocalGender: VocalGender;
  enabled: Record<AutoLyricToggleKey, boolean>;
}) {
  const parts: string[] = [];

  if (input.enabled.genre) {
    parts.push(autoLyricOptionLabels.genre[input.genre]);
  }

  if (input.enabled.tempo) {
    parts.push(`${autoLyricOptionLabels.tempo[input.tempo]} 템포`);
  }

  if (input.enabled.instrument) {
    parts.push(`${autoLyricOptionLabels.instrument[input.instrument]} 중심`);
  }

  if (input.enabled.emotion) {
    parts.push(autoLyricOptionLabels.emotion[input.emotion]);
  }

  if (input.vocalGender === "female") {
    parts.push("여성 보컬");
  } else if (input.vocalGender === "male") {
    parts.push("남성 보컬");
  }

  return parts.join(", ");
}

function buildAutoTitle(input: {
  topic: AutoLyricTopic;
  situation: AutoLyricSituation;
  emotion: AutoLyricEmotion;
  genre: AutoLyricGenre;
  enabled: Record<AutoLyricToggleKey, boolean>;
}) {
  const titleParts: string[] = [];

  if (input.enabled.topic) {
    titleParts.push(autoLyricOptionLabels.topic[input.topic]);
  }

  if (input.enabled.emotion) {
    titleParts.push(autoLyricOptionLabels.emotion[input.emotion]);
  }

  if (titleParts.length === 0 && input.enabled.situation) {
    titleParts.push(autoLyricOptionLabels.situation[input.situation]);
  }

  if (titleParts.length === 0 && input.enabled.genre) {
    titleParts.push(autoLyricOptionLabels.genre[input.genre]);
  }

  if (titleParts.length === 0) {
    titleParts.push("자동 생성");
  }

  return titleParts.slice(0, 2).join("의 ");
}

export function AuthPanel({ showAllMusicList = false }: AuthPanelProps) {
  const [message, setMessage] = useState("Google 계정으로 로그인하면 바로 작업 화면으로 이동합니다.");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [lyricMode, setLyricMode] = useState<LyricMode>("manual");
  const [isMr, setIsMr] = useState(false);
  const [vocalGender, setVocalGender] = useState<VocalGender>("auto");
  const [modelVersion, setModelVersion] = useState<ModelVersion>("v5_5");
  const [autoLyricTopic, setAutoLyricTopic] = useState<AutoLyricTopic>("hometown");
  const [autoLyricSituation, setAutoLyricSituation] = useState<AutoLyricSituation>("memory");
  const [autoLyricEmotion, setAutoLyricEmotion] = useState<AutoLyricEmotion>("yearning");
  const [autoLyricWording, setAutoLyricWording] = useState<AutoLyricWording>("easy");
  const [autoLyricHook, setAutoLyricHook] = useState<AutoLyricHook>("strong");
  const [autoLyricGenre, setAutoLyricGenre] = useState<AutoLyricGenre>("trot");
  const [autoLyricTempo, setAutoLyricTempo] = useState<AutoLyricTempo>("medium");
  const [autoLyricInstrument, setAutoLyricInstrument] = useState<AutoLyricInstrument>("guitar");
  const [autoLyricEnabled, setAutoLyricEnabled] = useState<Record<AutoLyricToggleKey, boolean>>({
    topic: true,
    situation: true,
    emotion: true,
    wording: true,
    hook: true,
    genre: false,
    tempo: false,
    instrument: false,
  });
  const [musics, setMusics] = useState<MusicItem[]>([]);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [isBooting, setIsBooting] = useState(true);
  const [messageTone, setMessageTone] = useState<"neutral" | "error" | "success">("neutral");
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);

  async function loadCurrentUser() {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await readJson(response)) as { item: PublicUser };
    return data.item;
  }

  async function loadMusicItems() {
    const response = await fetch("/api/music", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("음악 목록을 불러오지 못했습니다.");
    }

    const data = (await readJson(response)) as { items: MusicItem[] };
    setMusics(data.items);
  }

  async function reloadMusicAndUser() {
    await loadMusicItems();
    const refreshedUser = await loadCurrentUser();
    setUser(refreshedUser);
  }

  useEffect(() => {
    let isMounted = true;

    startTransition(async () => {
      try {
        const currentUser = await loadCurrentUser();

        if (isMounted) {
          setUser(currentUser);
          if (currentUser) {
            setMessage("다시 오신 것을 환영합니다.");
            setMessageTone("success");
            await loadMusicItems();
          }
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (isMr && lyricMode === "ai_lyrics") {
      setLyricMode("manual");
    }
  }, [isMr, lyricMode]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const hasPendingMusic = musics.some(
      (item) => item.status === "QUEUED" || item.status === "PROCESSING",
    );

    if (!hasPendingMusic) {
      return;
    }

    const timer = window.setInterval(() => {
      startTransition(async () => {
        try {
          await loadMusicItems();
          const refreshedUser = await loadCurrentUser();
          setUser(refreshedUser);
        } catch {
          // silent polling
        }
      });
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [musics, user]);

  function logout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setMusics([]);
      setMessage("로그아웃했습니다. 다시 Google 계정으로 로그인해 주세요.");
      setMessageTone("neutral");
    });
  }

  function createMusic() {
    if (!hasEnoughCreditsForGeneration) {
      const errorMessage = "크레딧이 부족합니다. 음악 생성에는 500크레딧이 필요합니다.";
      setMessage(errorMessage);
      setMessageTone("error");
      alert(errorMessage);
      return;
    }

    startTransition(async () => {
      try {
        if (isMr) {
          alert("MR모드로 생성됩니다.");
        }

        setMessage("음악 생성 요청을 등록하는 중입니다...");
        setMessageTone("neutral");

        const isAutoBuilder = lyricMode === "auto";
        const effectiveTitle = isAutoBuilder
          ? buildAutoTitle({
              topic: autoLyricTopic,
              situation: autoLyricSituation,
              emotion: autoLyricEmotion,
              genre: autoLyricGenre,
              enabled: autoLyricEnabled,
            })
          : title;
        const effectiveLyrics = isAutoBuilder
          ? buildAutoLyricPrompt({
              topic: autoLyricTopic,
              situation: autoLyricSituation,
              emotion: autoLyricEmotion,
              wording: autoLyricWording,
              hook: autoLyricHook,
              genre: autoLyricGenre,
              tempo: autoLyricTempo,
              instrument: autoLyricInstrument,
              vocalGender,
              stylePrompt,
              enabled: autoLyricEnabled,
            })
          : lyrics;
        const effectiveStylePrompt = isAutoBuilder
          ? buildAutoStylePrompt({
              genre: autoLyricGenre,
              tempo: autoLyricTempo,
              instrument: autoLyricInstrument,
              emotion: autoLyricEmotion,
              vocalGender,
              enabled: autoLyricEnabled,
            })
          : stylePrompt;

        const response = await fetch("/api/music", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            title: effectiveTitle,
            lyrics: effectiveLyrics,
            stylePrompt: effectiveStylePrompt,
            lyricMode,
            isMr,
            vocalGender,
            trackCount: 1,
            modelVersion,
          }),
        });

        await readJson(response);
        await reloadMusicAndUser();
        setTitle("");
        setLyrics("");
        setStylePrompt("");
        setLyricMode("manual");
        setIsMr(false);
        setVocalGender("auto");
        setModelVersion("v5_5");
        setAutoLyricTopic("hometown");
        setAutoLyricSituation("memory");
        setAutoLyricEmotion("yearning");
        setAutoLyricWording("easy");
        setAutoLyricHook("strong");
        setAutoLyricGenre("trot");
        setAutoLyricTempo("medium");
        setAutoLyricInstrument("guitar");
        setAutoLyricEnabled({
          topic: true,
          situation: true,
          emotion: true,
          wording: true,
          hook: true,
          genre: false,
          tempo: false,
          instrument: false,
        });
        setMessage("음악 생성 요청을 등록했습니다.");
        setMessageTone("success");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "음악 생성 요청에 실패했습니다.";
        setMessage(errorMessage);
        setMessageTone("error");
        if (errorMessage.includes("크레딧이 부족")) {
          alert(errorMessage);
        }
      }
    });
  }

  function unlockBonusTrack(musicId: string) {
    startTransition(async () => {
      try {
        setMessage("추가곡을 여는 중입니다...");

        const response = await fetch(`/api/music/${musicId}/unlock-bonus`, {
          method: "POST",
          credentials: "include",
        });

        await readJson(response);
        await reloadMusicAndUser();
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

  const visibleMusics = musics.filter((item) => item.status !== "FAILED");
  const recentMusics = showAllMusicList ? visibleMusics : visibleMusics.slice(0, 3);
  const hasEnoughCreditsForGeneration = (user?.totalCredits ?? 0) >= MUSIC_GENERATION_COST;

  if (isBooting) {
    return (
      <section className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm rounded-[1.75rem] border border-[var(--border)] bg-white/85 p-7 text-center shadow-[0_20px_60px_rgba(90,55,30,0.12)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            AI Trot Studio
          </p>
          <p className="mt-4 text-base text-[#5a4336]">세션 상태를 확인하는 중입니다...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="flex min-h-screen items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm rounded-[1.9rem] border border-[var(--border)] bg-white/90 p-6 shadow-[0_25px_80px_rgba(90,55,30,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--accent)]">
            AI Trot Studio
          </p>
          <h1 className="mt-4 text-[1.9rem] font-semibold leading-tight text-[#2d2018]">
            Google로 로그인하고 바로 음악 작업을 시작하세요
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#6b5648]">
            Google 계정으로만 로그인할 수 있습니다. 처음 로그인하면 무료 크레딧 1,000이 즉시
            지급됩니다.
          </p>

          <a
            href="/api/auth/google"
            className="mt-6 flex w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-white px-5 py-4 text-base font-semibold text-[#2d2018] shadow-[0_8px_20px_rgba(90,55,30,0.08)]"
          >
            Google로 시작하기
          </a>

          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[#fffaf4] p-4">
            <p className="text-sm leading-7 text-[#6b5648]">{message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-5">
      <div className="rounded-[1.6rem] border border-[var(--border)] bg-white/88 p-4 shadow-[0_15px_40px_rgba(90,55,30,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#5a4336]">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#f4efe8] px-3 py-1 text-xs font-semibold text-[#5d493e]">
                총 {formatCredits(user.totalCredits)}
              </span>
              <span className="rounded-full bg-[#eef8f1] px-3 py-1 text-xs font-semibold text-[#1c6a42]">
                무료 {formatCredits(user.freeCredits)}
              </span>
              <span className="rounded-full bg-[#fff0eb] px-3 py-1 text-xs font-semibold text-[#b64822]">
                유료 {formatCredits(user.paidCredits)}
              </span>
              <Link
                href="/credits"
                className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-3 py-1 text-[11px] font-semibold text-[var(--accent)]"
              >
                크레딧 충전
              </Link>
              {user.role !== "USER" ? (
                <Link
                  href="/admin"
                  className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-3 py-1 text-[11px] font-semibold text-[#1f5fbf]"
                >
                  관리자 페이지
                </Link>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={isPending}
            className="shrink-0 rounded-full border border-[var(--border)] bg-[#fbf6ef] px-4 py-2 text-xs font-semibold text-[#4e3b30] disabled:opacity-60"
          >
            로그아웃
          </button>
        </div>
      </div>

      {!showAllMusicList ? (
        <div className="mt-4 rounded-[1.8rem] border border-[var(--border)] bg-white/92 p-5 shadow-[0_18px_50px_rgba(90,55,30,0.1)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                Music Create
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[#2d2018]">음악 생성 입력</h2>
            </div>
            <span className="rounded-full bg-[#fff6e6] px-3 py-1 text-xs font-semibold text-[#9a5b09]">
              1곡 · 500크레딧
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-[#6b5648]">
            생성 시 기본 1곡이 바로 열리고, 숨겨진 추가곡은 생성 후 7일 안에 200크레딧으로 열 수 있습니다.
          </p>

          <div className="mt-5 grid gap-4">
            {lyricMode !== "auto" ? (
              <label className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                제목
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 당신을 만나지 어제 같은데"
                  className="rounded-[1.2rem] border border-[var(--border)] bg-[#fffdf9] px-4 py-3 text-base outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            ) : (
              <div className="rounded-[1.2rem] border border-[var(--border)] bg-[#fffaf4] px-4 py-3 text-sm text-[#6b5648]">
                제목은 자동으로 `자동` 으로 들어갑니다.
              </div>
            )}

            <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
              <span>가사 모드</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "manual", label: "직접 입력" },
                  ...(!isMr ? [{ value: "ai_lyrics", label: "AI가사" }] : []),
                  { value: "auto", label: "AI 자동 생성" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setLyricMode(option.value as LyricMode);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      lyricMode === option.value
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border)] bg-[#fffdf9] text-[#5a4336]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-[#3b2a20]">
              <input
                type="checkbox"
                checked={isMr}
                onChange={(event) => setIsMr(event.target.checked)}
              />
              <span>MR 생성</span>
            </label>

            {lyricMode === "auto" ? (
              <div className="rounded-[1.3rem] border border-[var(--border)] bg-[#fffaf4] p-4">
                <div>
                  <p className="text-sm font-semibold text-[#3b2a20]">자동 가사 보조 옵션</p>
                  <p className="mt-1 text-xs leading-6 text-[#7d6859]">
                    체크한 항목만 반영해서 생성 요청 시 자동으로 가사 아이디어 문장을 만듭니다.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.topic}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({ ...current, topic: event.target.checked }))
                        }
                      />
                      <span>주제</span>
                    </label>
                    {autoLyricEnabled.topic ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.topic) as AutoLyricTopic[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setAutoLyricTopic(option)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              autoLyricTopic === option
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border)] bg-white text-[#5a4336]"
                            }`}
                          >
                            {autoLyricOptionLabels.topic[option]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.situation}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({
                            ...current,
                            situation: event.target.checked,
                          }))
                        }
                      />
                      <span>상황</span>
                    </label>
                    {autoLyricEnabled.situation ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.situation) as AutoLyricSituation[]).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAutoLyricSituation(option)}
                              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                autoLyricSituation === option
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-[var(--border)] bg-white text-[#5a4336]"
                              }`}
                            >
                              {autoLyricOptionLabels.situation[option]}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.emotion}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({ ...current, emotion: event.target.checked }))
                        }
                      />
                      <span>감정</span>
                    </label>
                    {autoLyricEnabled.emotion ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.emotion) as AutoLyricEmotion[]).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAutoLyricEmotion(option)}
                              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                autoLyricEmotion === option
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-[var(--border)] bg-white text-[#5a4336]"
                              }`}
                            >
                              {autoLyricOptionLabels.emotion[option]}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.wording}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({ ...current, wording: event.target.checked }))
                        }
                      />
                      <span>표현</span>
                    </label>
                    {autoLyricEnabled.wording ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.wording) as AutoLyricWording[]).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAutoLyricWording(option)}
                              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                autoLyricWording === option
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-[var(--border)] bg-white text-[#5a4336]"
                              }`}
                            >
                              {autoLyricOptionLabels.wording[option]}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-sm font-medium text-[#3b2a20]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={autoLyricEnabled.hook}
                      onChange={(event) =>
                        setAutoLyricEnabled((current) => ({ ...current, hook: event.target.checked }))
                      }
                    />
                    <span>후렴 방향</span>
                  </label>
                  {autoLyricEnabled.hook ? (
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(autoLyricOptionLabels.hook) as AutoLyricHook[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAutoLyricHook(option)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            autoLyricHook === option
                              ? "bg-[var(--accent)] text-white"
                              : "border border-[var(--border)] bg-white text-[#5a4336]"
                          }`}
                        >
                          {autoLyricOptionLabels.hook[option]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.genre}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({ ...current, genre: event.target.checked }))
                        }
                      />
                      <span>장르</span>
                    </label>
                    {autoLyricEnabled.genre ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.genre) as AutoLyricGenre[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setAutoLyricGenre(option)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              autoLyricGenre === option
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border)] bg-white text-[#5a4336]"
                            }`}
                          >
                            {autoLyricOptionLabels.genre[option]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.tempo}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({ ...current, tempo: event.target.checked }))
                        }
                      />
                      <span>템포</span>
                    </label>
                    {autoLyricEnabled.tempo ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.tempo) as AutoLyricTempo[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setAutoLyricTempo(option)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              autoLyricTempo === option
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border)] bg-white text-[#5a4336]"
                            }`}
                          >
                            {autoLyricOptionLabels.tempo[option]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoLyricEnabled.instrument}
                        onChange={(event) =>
                          setAutoLyricEnabled((current) => ({
                            ...current,
                            instrument: event.target.checked,
                          }))
                        }
                      />
                      <span>악기</span>
                    </label>
                    {autoLyricEnabled.instrument ? (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(autoLyricOptionLabels.instrument) as AutoLyricInstrument[]).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAutoLyricInstrument(option)}
                              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                autoLyricInstrument === option
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-[var(--border)] bg-white text-[#5a4336]"
                              }`}
                            >
                              {autoLyricOptionLabels.instrument[option]}
                            </button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-[1rem] border border-[var(--border)] bg-white px-4 py-3 text-xs leading-6 text-[#6b5648]">
                  자동 스타일:{" "}
                  {buildAutoStylePrompt({
                    genre: autoLyricGenre,
                    tempo: autoLyricTempo,
                    instrument: autoLyricInstrument,
                    emotion: autoLyricEmotion,
                    vocalGender,
                    enabled: autoLyricEnabled,
                  }) || "자동 선택"}
                </div>
              </div>
            ) : null}

            {lyricMode !== "auto" ? (
              <label className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                {lyricMode === "manual" ? "가사" : "AI가사 느낌 입력"}
                <textarea
                  value={lyrics}
                  onChange={(event) => setLyrics(event.target.value)}
                  placeholder={
                    lyricMode === "manual"
                      ? "예: 바람이 차가운 저녁이 오면..."
                      : "예: 고향을 그리워하는 중년 여성의 애틋한 트로트 가사를 만들어줘"
                  }
                  rows={7}
                  className="min-h-[170px] rounded-[1.4rem] border border-[var(--border)] bg-[#fffdf9] px-4 py-4 text-base leading-7 outline-none transition focus:border-[var(--accent)]"
                />
                <span className="text-xs text-[#8a7465]">{lyrics.length}자</span>
              </label>
            ) : null}

            {lyricMode !== "auto" ? (
              <label className="grid gap-2 text-sm font-medium text-[#3b2a20]">
                스타일
                <input
                  type="text"
                  value={stylePrompt}
                  onChange={(event) => setStylePrompt(event.target.value)}
                  placeholder="예: 신비롭고 애절한 분위기, 여성보컬"
                  className="rounded-[1.2rem] border border-[var(--border)] bg-[#fffdf9] px-4 py-3 text-base outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            ) : null}

            <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
              <span>모델 버전</span>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    value: "v4_5_plus" as ModelVersion,
                    label: "블루",
                    activeClass: "bg-[#1f5fbf] text-white border-[#1f5fbf]",
                    idleClass: "border border-[#bfd7ff] bg-[#eef5ff] text-[#1f5fbf]",
                  },
                  {
                    value: "v5" as ModelVersion,
                    label: "레드",
                    activeClass: "bg-[#b64822] text-white border-[#b64822]",
                    idleClass: "border border-[#f0c3b4] bg-[#fff1eb] text-[#b64822]",
                  },
                  {
                    value: "v5_5" as ModelVersion,
                    label: "골드",
                    activeClass: "bg-[#b8860b] text-white border-[#b8860b]",
                    idleClass: "border border-[#ead39a] bg-[#fff7df] text-[#9a6a07]",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setModelVersion(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      modelVersion === option.value ? option.activeClass : option.idleClass
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-sm font-medium text-[#3b2a20]">
              <span>보컬</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "auto", label: "자동" },
                  { value: "female", label: "여성" },
                  { value: "male", label: "남성" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVocalGender(option.value as VocalGender)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      vocalGender === option.value
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border)] bg-[#fffdf9] text-[#5a4336]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          <button
            type="button"
            onClick={createMusic}
            disabled={
              isPending ||
              !hasEnoughCreditsForGeneration ||
              (lyricMode !== "auto" && title.trim().length < 1) ||
              (!isMr && lyricMode !== "auto" && lyrics.trim().length < 10) ||
              (lyricMode !== "auto" && stylePrompt.trim().length < 2)
            }
            className="mt-5 w-full rounded-[1.3rem] bg-[var(--accent)] px-5 py-4 text-base font-semibold text-white shadow-[0_14px_30px_rgba(182,72,34,0.22)] disabled:opacity-60"
          >
            {isPending ? "처리 중..." : "음악 생성 요청하기"}
          </button>

          {!hasEnoughCreditsForGeneration ? (
            <p className="mt-3 text-sm font-medium text-[#b64822]">
              크레딧이 부족합니다. 음악 생성에는 500크레딧이 필요합니다.
            </p>
          ) : null}

          <div
            className={`mt-4 rounded-[1.2rem] border px-4 py-3 ${
              messageTone === "error"
                ? "border-[#f0c3b4] bg-[#fff1eb]"
                : messageTone === "success"
                  ? "border-[#c9e8d4] bg-[#eef8f1]"
                  : "border-[var(--border)] bg-[#fffaf4]"
            }`}
          >
            <p
              className={`text-sm leading-7 ${
                messageTone === "error"
                  ? "font-medium text-[#b64822]"
                  : messageTone === "success"
                    ? "text-[#1c6a42]"
                    : "text-[#6b5648]"
              }`}
            >
              {message}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-[1.6rem] border border-[var(--border)] bg-white/88 p-4 shadow-[0_15px_40px_rgba(90,55,30,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              My Music
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[#2d2018]">
              {showAllMusicList ? "전체 음악 리스트" : "최근 생성 음악"}
            </h2>
          </div>
          {!showAllMusicList && visibleMusics.length > 3 ? (
            <Link
              href="/music-history"
              className="rounded-full border border-[var(--border)] bg-[#fffdf9] px-3 py-2 text-xs font-semibold text-[#5a4336]"
            >
              전체 보기
            </Link>
          ) : (
            <span className="text-xs text-[#7a6558]">{visibleMusics.length}건</span>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {recentMusics.length === 0 ? (
            <div className="rounded-[1.2rem] border border-dashed border-[var(--border)] bg-[#fffaf4] p-4 text-sm leading-7 text-[#6b5648]">
              {showAllMusicList
                ? "표시할 완료/진행 중 음악이 없습니다."
                : "최근 생성한 음악이 없습니다. 아래 입력 폼에서 첫 요청을 등록해보세요."}
            </div>
          ) : (
            recentMusics.map((music) => (
              <article
                key={music.id}
                className="rounded-[1rem] border border-[var(--border)] bg-[#fffdf9] px-3 py-3"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-[#8a7465]">{formatDate(music.createdAt)}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(
                          music.status,
                        )}`}
                      >
                        {statusLabel(music.status)}
                      </span>
                      <span className="text-[11px] text-[#8a7465]">{music.tracks.length}곡</span>
                    </div>
                    <p className="mt-1 break-words text-sm font-medium text-[#3f2f25]">
                      {summarizeMusicLabel(music)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a7465]">스타일 · {music.stylePrompt}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end lg:self-start">
                    {music.tracks.map((track, index) =>
                      track.mp3Url ? (
                        <div key={track.id} className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => toggleTrackPlayback(track.id)}
                              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[11px] font-semibold text-[#4e3b30]"
                            >
                            {playingTrackId === track.id ? `닫기 ${index + 1}` : `듣기 ${index + 1}`}
                          </button>
                          {new Date(track.downloadAvailableAt).getTime() <= nowTs ? (
                            <>
                              <TrackDownloadMenu
                                trackId={track.id}
                                trackIndex={index + 1}
                                mp4Url={track.mp4Url}
                                latestVideoId={track.latestVideoId}
                                title={music.title ?? "제목 없는 곡"}
                                lyrics={music.lyrics}
                                isMr={music.isMr}
                                onCompleted={reloadMusicAndUser}
                              />
                            </>
                          ) : (
                            <span className="rounded-full border border-[var(--border)] bg-[#f7f2eb] px-3 py-2 text-[11px] text-[#8a7465]">
                              {formatRemainingDownloadTimeFromNow(track.downloadAvailableAt, nowTs)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          key={track.id}
                          className="rounded-full border border-[var(--border)] bg-[#f7f2eb] px-3 py-2 text-[11px] text-[#8a7465]"
                        >
                          트랙 {index + 1} 준비중
                        </span>
                      ),
                    )}
                    {music.canUnlockBonusTrack ? (
                      <button
                        type="button"
                        onClick={() => unlockBonusTrack(music.id)}
                        disabled={isPending}
                        className="rounded-full border border-[var(--accent)] bg-[#fff1eb] px-3 py-2 text-[11px] font-semibold text-[var(--accent)] disabled:opacity-60"
                      >
                        추가곡생성 · {music.bonusUnlockCost}크레딧
                      </button>
                    ) : null}
                  </div>
                </div>
                {music.hiddenBonusTrackCount > 0 ? (
                  <p className="mt-2 text-[11px] text-[#8a7465]">
                    숨겨진 추가곡 {music.hiddenBonusTrackCount}곡
                    {music.canUnlockBonusTrack && music.bonusUnlockExpiresAt
                      ? ` · ${formatDateOnly(music.bonusUnlockExpiresAt)}까지 열기 가능`
                      : " · 추가곡 열기 기간이 지났습니다."}
                  </p>
                ) : null}
                {playingTrackId && music.tracks.some((track) => track.id === playingTrackId) && playingTrackUrl ? (
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
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
