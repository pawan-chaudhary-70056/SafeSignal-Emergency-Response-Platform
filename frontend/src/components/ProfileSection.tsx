import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, formatDate, inputClass } from "./ui";

const roleLabels: Record<string, string> = {
  CITIZEN: "Citizen",
  DISPATCHER: "Dispatcher",
  RESPONDER: "Responder",
  ADMIN: "Administrator",
};

/**
 * FR-005 profile management for the signed-in account. The email address and
 * role are protected account fields, so they are shown read-only; only the
 * display name and contact number can be changed here.
 */
export function ProfileSection({ id }: { id: string }) {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone ?? "");
    }
  }, [user]);

  if (!user) {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }

    if (phone.trim().length > 0 && phone.trim().length < 6) {
      setError("Phone number must be at least 6 characters, or clear it.");
      return;
    }

    setBusy(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim().length > 0 ? phone.trim() : null,
      });
      setNotice("Profile updated.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={id} title="My profile" subtitle="Your account identity used across SafeSignal.">
      <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/40 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Email
          </p>
          <p className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-200">
            {user.email}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Role
          </p>
          <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
            {roleLabels[user.role] ?? user.role}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Member since
          </p>
          <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
            {formatDate(user.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Email changes
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Contact an administrator to change your email or role.
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="profile-full-name"
            className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            Full name
          </label>
          <input
            id="profile-full-name"
            className={inputClass}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </div>

        <div>
          <label
            htmlFor="profile-phone"
            className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            Phone number
          </label>
          <input
            id="profile-phone"
            className={inputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+9779800000000"
            minLength={6}
            maxLength={30}
            autoComplete="tel"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Optional. Helps the response team reach you.
          </p>
        </div>

        {notice && <Alert tone="success" message={notice} />}
        {error && <Alert tone="error" message={error} />}

        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}
