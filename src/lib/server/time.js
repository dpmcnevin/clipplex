import { ClipError } from "./errors.js";

export function msToTime(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export const secondsToTime = (seconds) => msToTime(seconds * 1000);

export function timeToSeconds(value) {
  const parts = String(value ?? "").split(":");
  if (parts.length !== 3 || !parts.every((part) => /^\d+$/.test(part.trim()))) {
    throw new ClipError(`'${value}' is not a HH:MM:SS time.`);
  }
  const [hours, minutes, seconds] = parts.map((part) => Number(part));
  return hours * 3600 + minutes * 60 + seconds;
}

export function normaliseTime(value) {
  const parts = String(value ?? "").split(":");
  if (parts.length !== 3) throw new ClipError(`'${value}' is not a HH:MM:SS time.`);
  return parts.map((part) => part.trim().padStart(2, "0")).join(":");
}

/** Seconds between two HH:MM:SS times, rejecting a range that goes backwards. */
export function clipDuration(start, end) {
  const total = timeToSeconds(end) - timeToSeconds(start);
  if (total <= 0) throw new ClipError("The end time must be after the start time.");
  return total;
}

export function addSeconds(start, secondsToAdd) {
  return secondsToTime(timeToSeconds(start) + Number(secondsToAdd));
}
