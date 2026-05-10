import { redirect } from "next/navigation";

/**
 * Backward-compatibility redirect.
 * Old URL: /settings/danger → New URL: /settings/danger-zone
 */
export default function DangerRedirect() {
  redirect("/settings/danger-zone");
}
