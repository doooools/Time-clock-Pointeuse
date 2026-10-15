// Login page strings.
import type { login as fr } from "../fr/login";

export const login: Record<keyof typeof fr, string> = {
  passwordLabel: "password",
  wrongPassword: "✕ Wrong password. Try again.",
  stampRefused: "denied",
  submit: "enter →",
  checking: "checking…",
  readOnly: "no password? browse read-only",
};
