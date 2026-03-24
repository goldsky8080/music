import { env } from "@/lib/env";
import type { CreateMusicInput, ProviderMusicResult } from "./types";

/**
 * 음악 생성 공급자 인터페이스.
 *
 * 현재 프로젝트는 mock 공급자와 실제 Suno 공급자를 모두 지원한다.
 * API 라우트와 서비스 계층은 이 인터페이스만 의존하므로,
 * 나중에 다른 공급자를 붙일 때도 변경 범위를 최소화할 수 있다.
 */
export interface MusicProvider {
  createMusic(input: CreateMusicInput): Promise<ProviderMusicResult>;
  getMusicStatus(taskId: string): Promise<ProviderMusicResult>;
  cancelMusic(taskId: string): Promise<void>;
}

// Suno 웹앱 DevTools에서 추적한 내부 모델 식별자.
const SUNO_MODEL_V5 = "chirp-crow";
const SUNO_MODEL_V45_PLUS = "chirp-bluejay";

// UI 모델 선택값을 Suno 내부 모델 키로 변환한다.
function resolveModelVersion(modelVersion?: "v4_5_plus" | "v5") {
  return modelVersion === "v4_5_plus" ? SUNO_MODEL_V45_PLUS : SUNO_MODEL_V5;
}

function inferVocalGender(stylePrompt: string): "f" | "m" | undefined {
  if (/(여성|여자|female|woman|girl)/i.test(stylePrompt)) {
    return "f";
  }

  if (/(남성|남자|male|man|boy)/i.test(stylePrompt)) {
    return "m";
  }

  return undefined;
}

/**
 * 스타일 프롬프트에 영어 보컬 힌트를 덧붙여 모델이 성별을 더 강하게 인식하도록 돕는다.
 */
function buildStyleTags(stylePrompt: string, vocalGender?: "f" | "m"): string {
  if (vocalGender === "f" && !/female vocal|female singer/i.test(stylePrompt)) {
    return `${stylePrompt}, female vocal, female singer`;
  }

  if (vocalGender === "m" && !/male vocal|male singer/i.test(stylePrompt)) {
    return `${stylePrompt}, male vocal, male singer`;
  }

  return stylePrompt;
}

/**
 * 외부 API 없이 전체 생성 흐름을 검증하기 위한 개발용 공급자.
 */
class MockMusicProvider implements MusicProvider {
  async createMusic(input: CreateMusicInput): Promise<ProviderMusicResult> {
    const taskId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    void input;

    return {
      providerTaskId: taskId,
      status: "processing",
    };
  }

  async getMusicStatus(taskId: string): Promise<ProviderMusicResult> {
    const createdAtToken = Number(taskId.split("-")[1] ?? Date.now());
    const elapsedMs = Date.now() - createdAtToken;

    if (elapsedMs > 4000) {
      return {
        providerTaskId: taskId,
        status: "completed",
      };
    }

    return {
      providerTaskId: taskId,
      status: "processing",
    };
  }

  async cancelMusic(_: string): Promise<void> {}
}

export class SunoProvider implements MusicProvider {
  /**
   * 실제 wrapper 서버로 전달할 공통 헤더를 구성한다.
   * 필요할 경우 Suno 세션 쿠키도 함께 넘길 수 있게 해두었다.
   */
  private buildHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (env.SUNO_COOKIE) {
      headers.Cookie = env.SUNO_COOKIE;
    }

    return headers;
  }

  async createMusic(input: CreateMusicInput): Promise<ProviderMusicResult> {
    if (!env.SUNO_API_BASE_URL) {
      throw new Error("Suno provider is not configured.");
    }

    // 사용자의 직접 선택을 우선하고, 없을 때만 스타일 문구에서 성별을 추론한다.
    const vocalGender =
      input.vocalGender === "female"
        ? "f"
        : input.vocalGender === "male"
          ? "m"
          : inferVocalGender(input.stylePrompt);
    const tags = buildStyleTags(input.stylePrompt, vocalGender);
    const sunoModel = resolveModelVersion(input.modelVersion);
    const isAutoLyrics = input.lyricMode === "auto";

    /**
     * 자동 가사 모드는 현재 API 레벨에서 막혀 있지만,
     * wrapper 패치 재개를 고려해 provider 쪽 분기 구조는 유지한다.
     */
    const endpoint = `${env.SUNO_API_BASE_URL}/api/custom_generate`;

    /**
     * Payload 설계 원칙:
     * - title: 곡 제목
     * - prompt: 실제 가사
     * - tags: 스타일/장르/보컬 힌트
     * - model / metadata.mv: Suno 내부 모델 식별자
     */
    const payload = isAutoLyrics
      ? {
          title: input.title,
          prompt: "",
          gpt_description_prompt: input.lyrics,
          tags,
          negative_tags: "",
          generation_type: "TEXT",
          make_instrumental: false,
          wait_audio: false,
          mv: sunoModel,
          metadata: {
            create_mode: "custom",
            is_custom: true,
            mv: sunoModel,
            vocal_gender: vocalGender,
            web_client_pathname: "/create",
          },
        }
      : {
          title: input.title,
          prompt: input.lyrics,
          tags,
          model: sunoModel,
          negative_tags: "",
          generation_type: "TEXT",
          make_instrumental: false,
          wait_audio: false,
          metadata: {
            create_mode: "custom",
            is_custom: true,
            mv: sunoModel,
            vocal_gender: vocalGender,
          },
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(payload),
    });

    // wrapper가 내려준 에러 원문을 최대한 유지해야 실제 운영 중 디버깅이 수월하다.
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suno music creation request failed. ${errorText}`);
    }

    const responseJson = (await response.json()) as
      | Array<{
          id?: string;
          status?: string;
          audio_url?: string;
        }>
      | {
          clips?: Array<{
            id?: string;
            status?: string;
            audio_url?: string;
          }>;
        };

    const data = Array.isArray(responseJson) ? responseJson : responseJson.clips ?? [];

    if (!Array.isArray(data) || data.length === 0 || !data[0]?.id) {
      throw new Error("Suno provider did not return track ids.");
    }

    // Suno는 한 번의 요청에 여러 clip을 돌려줄 수 있어 tracks 배열로 함께 전달한다.
    return {
      providerTaskId: data
        .map((item) => item.id)
        .filter(Boolean)
        .join(","),
      status: "queued",
      mp3Url: data[0]?.audio_url,
      tracks: data
        .filter((item): item is { id: string; status?: string; audio_url?: string } => Boolean(item.id))
        .map((item) => ({
          providerTaskId: item.id,
          status:
            item.status?.toLowerCase() === "error" || item.status?.toLowerCase() === "failed"
              ? "failed"
              : item.status?.toLowerCase() === "complete" || item.status?.toLowerCase() === "completed"
                ? "completed"
                : item.status?.toLowerCase() === "processing"
                  ? "processing"
                  : "queued",
          mp3Url: item.audio_url,
        })),
    };
  }

  async getMusicStatus(taskId: string): Promise<ProviderMusicResult> {
    if (!env.SUNO_API_BASE_URL) {
      throw new Error("Suno provider is not configured.");
    }

    // 여러 track id를 콤마로 묶어 저장하므로 상태 조회도 ids 하나로 묶어 요청한다.
    const response = await fetch(`${env.SUNO_API_BASE_URL}/api/get?ids=${encodeURIComponent(taskId)}`, {
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suno status lookup failed. ${errorText}`);
    }

    const data = (await response.json()) as Array<{
      id?: string;
      status?: string;
      audio_url?: string;
      error_message?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Suno provider returned no track status.");
    }

    const normalized = data.map((item) => item.status?.toLowerCase() ?? "queued");
    const hasFailure = normalized.some((status) => status === "failed" || status === "error");
    const isCompleted = normalized.every(
      (status) => status === "streaming" || status === "complete" || status === "completed",
    );
    const isProcessing = normalized.some(
      (status) => status === "submitted" || status === "queued" || status === "pending" || status === "processing",
    );

    return {
      providerTaskId: taskId,
      status: hasFailure ? "failed" : isCompleted ? "completed" : isProcessing ? "processing" : "queued",
      mp3Url: data[0]?.audio_url,
      errorMessage: data.find((item) => item.error_message)?.error_message,
    };
  }

  async cancelMusic(taskId: string): Promise<void> {
    void taskId;
    throw new Error("Suno cancellation is not supported by the configured wrapper.");
  }
}

/**
 * 환경 변수에 따라 실제 Suno 공급자 또는 mock 공급자를 선택한다.
 */
export function getMusicProvider(): MusicProvider {
  if (env.MUSIC_PROVIDER_MODE === "suno") {
    return new SunoProvider();
  }

  return new MockMusicProvider();
}
