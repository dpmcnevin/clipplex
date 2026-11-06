export class PathNotAllowed extends Error {
  status = 403;
}

export class ClipError extends Error {
  status = 400;
}

export class PlexUnavailable extends Error {
  status = 502;
}

export class StreamableError extends Error {
  status = 502;
}

/** Turn any thrown value into a {status, message} pair for an API response. */
export function asFailure(error) {
  const status = error?.status ?? 500;
  return { status, message: error?.message || "Something went wrong." };
}
