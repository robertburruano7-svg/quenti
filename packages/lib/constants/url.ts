import { env } from "@studyapp/env/client";

export const WEBSITE_URL =
  env.NEXT_PUBLIC_WEBSITE_URL || "https://studyapp.example";
export const APP_URL = env.NEXT_PUBLIC_APP_URL;
