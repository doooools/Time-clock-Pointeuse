// Login page strings.
import type { login as fr } from "../fr/login";

export const login: Record<keyof typeof fr, string> = {
  usernameLabel: "username",
  passwordLabel: "password",
  wrongCredentials: "✕ Wrong username or password.",
  stampRefused: "denied",
  submit: "enter →",
  checking: "checking…",
};
