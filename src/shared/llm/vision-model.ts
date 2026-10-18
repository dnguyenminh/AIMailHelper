// src/shared/llm/vision-model.ts — chọn model cho Vision-read attachment (UAT 18/10, user rule):
// (1) config.vision.model (model VL riêng — user có 2 model text + VL) → dùng;
// (2) model text chính có tên khớp pattern VL nổi tiếng → dùng luôn (model text hỗ trợ VL);
// (3) không cái nào → null → caller BỎ QUA vision (fallback placeholder/bytes).
const VL_PATTERNS: RegExp[] = [
  /-4o(?!rd)/i, // gpt-4o, chatgpt-4o-latest (không phải "word")
  /gpt-4\.1/i,
  /o[13](-mini)?$/i, // o1/o3-mini
  /claude-(3\.5|3-5|4|sonnet|opus|haiku)/i,
  /gemini/i,
  /\bvl\b|vision|llava|qwen[^ ]*-?vl|pixtral|intern-vl/i,
  /grok-(vision|4)/i
];

// Model text có HỖ TRỢ VL không — dựa tên (provider không expose capability qua API list).
// False-negative chấp nhận được (→ user set vision.model tường minh).
export function isVisionCapableModel(model: string): boolean {
  const trimmed = model.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  return VL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export interface VisionModelConfig {
  model: string; // model text chính (ConfigData.model)
  vision: { model?: string }; // model VL riêng (VisionConfig.model — optional)
}

// Trả TÊN model dùng cho vision call, hoặc null khi không có model VL nào.
export function resolveVisionModel(config: VisionModelConfig): string | null {
  const dedicated = config.vision.model?.trim();
  if (dedicated !== undefined && dedicated.length > 0) return dedicated;
  if (isVisionCapableModel(config.model)) return config.model;
  return null;
}
