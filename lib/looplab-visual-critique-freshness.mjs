function normalizedSha256(value) {
  const match = String(value ?? "").trim().toLowerCase().match(/^(?:sha256:)?([a-f0-9]{64})$/);
  return match ? `sha256:${match[1]}` : null;
}

export function isVisualCritiqueFresh({ critique, request, currentSourceDigest, visualReview } = {}) {
  if (!critique || !request || !visualReview || !currentSourceDigest) return false;
  if (critique.sourceDigest !== currentSourceDigest) return false;
  if (request.sourceDigest !== currentSourceDigest) return false;
  if (visualReview.sourceDigest !== currentSourceDigest) return false;
  if (critique.captureSetDigest !== request.captureSetDigest) return false;
  if (!Array.isArray(request.captures) || request.captureCount !== request.captures.length) return false;
  if (!Array.isArray(visualReview.captures)) return false;
  const currentCaptures = new Map(visualReview.captures.map((capture) => [String(capture.id), normalizedSha256(capture.sha256)]));
  return request.captures.every((capture) => (
    currentCaptures.get(String(capture.id)) === normalizedSha256(capture.sha256)
  ));
}

export function visualCritiqueFreshnessReason(input = {}) {
  if (!input.critique) return "no-critique";
  if (!input.request) return "request-unavailable";
  if (!input.visualReview) return "visual-review-unavailable";
  if (input.critique.sourceDigest !== input.currentSourceDigest || input.request.sourceDigest !== input.currentSourceDigest || input.visualReview.sourceDigest !== input.currentSourceDigest) return "source-changed";
  if (input.critique.captureSetDigest !== input.request.captureSetDigest) return "capture-set-changed";
  return isVisualCritiqueFresh(input) ? null : "capture-bytes-changed";
}
