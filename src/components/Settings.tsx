import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { NotificationPreferences } from "./notifications/NotificationPreferences";
import { ClassificationRules } from "./ClassificationRules";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Button } from "./ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

type Provider = "openai" | "anthropic" | "litellm";

interface ApiKeyMeta {
  id: string;
  provider: Provider;
  label: string;
  baseUrl?: string;
  createdAt: string;
}

interface GmailAccount {
  id: string;
  email: string;
  displayName: string;
  color?: string | null;
}

const PRESET_COLORS = [
  "#1976d2", // Blue
  "#388e3c", // Green
  "#f57c00", // Orange
  "#7b1fa2", // Purple
  "#c62828", // Red
  "#00838f", // Teal
  "#455a64", // Blue Grey
  "#ad1457", // Pink
  "#558b2f", // Light Green
  "#ef6c00", // Amber
] as const;

const DEFAULT_COLOR = "#9e9e9e";

interface TelemetrySettings {
  optedIn: boolean;
  consentedAt: string | null;
}

interface AiConsentSettings {
  consented: boolean;
  policyVersion: string;
  consentedAt: string | null;
  revokedAt: string | null;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  litellm: "liteLLM (Custom)",
};

function maskKey(label: string, provider: string): string {
  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)}: ${label.slice(0, 3)}***`;
}

export function Settings() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [telemetrySettings, setTelemetrySettings] =
    useState<TelemetrySettings | null>(null);
  const [telemetrySaving, setTelemetrySaving] = useState(false);
  const [aiConsentSettings, setAiConsentSettings] =
    useState<AiConsentSettings | null>(null);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [cronStatus, setCronStatus] = useState<{
    enabled: boolean;
    lastMode: "work_hours" | "off_hours" | null;
    config: {
      workStartHour: number;
      workStartMinute: number;
      workEndHour: number;
      workEndMinute: number;
      workIntervalSeconds: number;
      offHoursIntervalSeconds: number;
    };
  } | null>(null);
  const [cronSaving, setCronSaving] = useState(false);
  const cronConfigTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState("");
  const [hexError, setHexError] = useState<string | null>(null);
  const [colorSaving, setColorSaving] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(3);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    deleted: number;
    eligibleCount: number;
  } | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const { theme, setTheme } = useTheme();

  const loadKeys = useCallback(async () => {
    try {
      const list = await window.electronAPI.apikey.list();
      setKeys(list);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    }
  }, []);

  const loadGmailAccounts = useCallback(async () => {
    try {
      const list = await window.electronAPI.gmail.listAccounts();
      setGmailAccounts(list);
    } catch (err) {
      console.error("Failed to load Gmail accounts:", err);
    }
  }, []);

  const loadTelemetrySettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.telemetry.getSettings();
      setTelemetrySettings(settings);
    } catch (err) {
      console.error("Failed to load telemetry settings:", err);
    }
  }, []);

  const loadAiConsentSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.aiConsent.getSettings();
      setAiConsentSettings(settings);
    } catch (err) {
      console.error("Failed to load AI consent settings:", err);
    }
  }, []);

  const loadCronStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.cron.status();
      setCronStatus(status);
    } catch (err) {
      console.error("Failed to load cron status:", err);
    }
  }, []);

  const loadRetentionSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.emailCleanup.getSettings();
      setRetentionDays(settings.retentionDays);
    } catch (err) {
      console.error("Failed to load retention settings:", err);
    }
  }, []);

  useEffect(() => {
    loadKeys();
    loadGmailAccounts();
    loadTelemetrySettings();
    loadAiConsentSettings();
    loadCronStatus();
    loadRetentionSettings();
  }, [
    loadKeys,
    loadGmailAccounts,
    loadTelemetrySettings,
    loadAiConsentSettings,
    loadCronStatus,
    loadRetentionSettings,
  ]);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await window.electronAPI.apikey.save({
        provider,
        label: label || `${PROVIDER_LABELS[provider]} Key`,
        apiKey,
        baseUrl: provider === "litellm" ? baseUrl : undefined,
      });
      setSuccess(true);
      setLabel("");
      setApiKey("");
      setBaseUrl("");
      setShowKey(false);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    try {
      await window.electronAPI.apikey.delete(keyId);
      await loadKeys();
    } catch (err) {
      console.error("Failed to delete API key:", err);
    }
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    setError(null);
    try {
      await window.electronAPI.gmail.connect();
      await loadGmailAccounts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect Gmail account",
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGmail = async (accountId: string) => {
    try {
      await window.electronAPI.gmail.disconnect(accountId);
      await loadGmailAccounts();
    } catch (err) {
      console.error("Failed to disconnect Gmail account:", err);
    }
  };

  const handleTelemetryToggle = async () => {
    if (!telemetrySettings) return;
    setTelemetrySaving(true);
    try {
      await window.electronAPI.telemetry.setOptIn(!telemetrySettings.optedIn);
      await loadTelemetrySettings();
    } catch (err) {
      console.error("Failed to update telemetry settings:", err);
    } finally {
      setTelemetrySaving(false);
    }
  };

  const handleAiConsentToggle = async () => {
    if (!aiConsentSettings) return;
    const newConsented = !aiConsentSettings.consented;
    if (newConsented) {
      const confirmed = window.confirm(
        "AI Classification Consent\n\n" +
          "To enable AI features, you must acknowledge that:\n\n" +
          "• Email subject, sender address, and preview snippet will be sent to external LLM providers (OpenAI/Anthropic)\n" +
          "• You provide your own API keys (BYOK)\n" +
          "• Data is processed directly by the provider you configure\n" +
          "• You can revoke consent at any time in Settings\n\n" +
          "Do you accept these terms and want to enable AI features?",
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        "Disable AI Classification\n\n" +
          "Disabling AI features will stop email classification and urgent notifications. " +
          "You can re-enable AI features at any time in Settings.\n\n" +
          "Do you want to disable AI features?",
      );
      if (!confirmed) return;
    }
    setAiConsentSaving(true);
    try {
      await window.electronAPI.aiConsent.setConsent(newConsented);
      await loadAiConsentSettings();
    } catch (err) {
      console.error("Failed to update AI consent settings:", err);
    } finally {
      setAiConsentSaving(false);
    }
  };

  const handleCronToggle = async () => {
    if (!cronStatus) return;
    setCronSaving(true);
    try {
      if (cronStatus.enabled) {
        await window.electronAPI.cron.stop();
      } else {
        await window.electronAPI.cron.start();
      }
      await loadCronStatus();
    } catch (err) {
      console.error("Failed to toggle cron:", err);
    } finally {
      setCronSaving(false);
    }
  };

  const handleCronRunNow = async () => {
    setCronSaving(true);
    try {
      await window.electronAPI.cron.runNow();
      await loadCronStatus();
    } catch (err) {
      console.error("Failed to run cron now:", err);
    } finally {
      setCronSaving(false);
    }
  };

  const handleRetentionChange = async (newDays: number) => {
    setRetentionSaving(true);
    try {
      const result =
        await window.electronAPI.emailCleanup.setRetentionDays(newDays);
      setRetentionDays(result.retentionDays);
    } catch (err) {
      console.error("Failed to update retention days:", err);
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleRunCleanup = async () => {
    setCleanupRunning(true);
    setCleanupResult(null);
    try {
      const result = await window.electronAPI.emailCleanup.runCleanup();
      setCleanupResult(result);
    } catch (err) {
      console.error("Failed to run cleanup:", err);
    } finally {
      setCleanupRunning(false);
    }
  };

  const debouncedCronUpdate = useCallback(
    (patch: Record<string, number>) => {
      if (cronConfigTimerRef.current) {
        clearTimeout(cronConfigTimerRef.current);
      }
      cronConfigTimerRef.current = setTimeout(async () => {
        try {
          await window.electronAPI.cron.updateConfig(patch);
          await loadCronStatus();
        } catch (err) {
          console.error("Failed to update cron config:", err);
        }
      }, 500);
    },
    [loadCronStatus],
  );

  useEffect(() => {
    return () => {
      if (cronConfigTimerRef.current) {
        clearTimeout(cronConfigTimerRef.current);
      }
    };
  }, []);

  const handleApplyColor = async (accountId: string) => {
    setColorSaving(true);
    try {
      await window.electronAPI.accounts.updateColor(accountId, editingColor);
      await loadGmailAccounts();
      setEditingAccountId(null);
    } catch (err) {
      console.error("Failed to update account color:", err);
    } finally {
      setColorSaving(false);
    }
  };

  const handleResetColor = async (accountId: string) => {
    setColorSaving(true);
    try {
      await window.electronAPI.accounts.updateColor(accountId, null);
      await loadGmailAccounts();
      setEditingAccountId(null);
    } catch (err) {
      console.error("Failed to reset account color:", err);
    } finally {
      setColorSaving(false);
    }
  };

  return (
    <div className="p-8 font-sans max-w-[640px]">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/")}
          className="bg-transparent border-none cursor-pointer text-xl p-1"
        >
          ← Back
        </button>
        <h1 className="m-0 text-xl">Settings</h1>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 px-3"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 shrink-0" />
              ) : (
                <Moon className="h-4 w-4 shrink-0" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </TooltipContent>
        </Tooltip>
      </div>

      <section className="mb-8">
        <h2 className="text-lg mb-3">Google Accounts</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Connect your Google account to access Gmail and Google Tasks.
        </p>

        {gmailAccounts.length === 0 ? (
          <p className="text-muted-foreground text-sm mb-4">
            No accounts connected.
          </p>
        ) : (
          <div className="mb-4">
            {gmailAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg mb-2"
              >
                <div>
                  <div className="font-semibold text-sm">
                    {account.displayName}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {account.email}
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnectGmail(account.id)}
                  className="bg-transparent border border-destructive text-destructive rounded px-2 py-1 cursor-pointer text-xs"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleConnectGmail}
          disabled={connecting}
          className={`px-5 py-2.5 rounded border-none text-sm font-semibold ${
            connecting
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground cursor-pointer"
          }`}
        >
          {connecting ? "Connecting..." : "Connect Gmail Account"}
        </button>
      </section>

      <section className="mb-8">
        <h2 className="text-lg mb-3">Auto-Fetch</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Automatically fetch and classify emails on a schedule. During work
          hours, emails are fetched every 5 minutes. Outside work hours, every
          60 minutes.
        </p>

        {cronStatus ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cronStatus.enabled}
                  onChange={handleCronToggle}
                  disabled={cronSaving}
                  className="w-5 h-5"
                />
                <span className="text-sm">
                  {cronStatus.enabled
                    ? "Auto-fetch enabled"
                    : "Auto-fetch disabled"}
                </span>
              </label>
              {cronStatus.enabled && (
                <span className="text-muted-foreground text-xs">
                  Mode:{" "}
                  {cronStatus.lastMode === "work_hours"
                    ? "Work Hours"
                    : "Off Hours"}{" "}
                  | Interval:{" "}
                  {cronStatus.lastMode === "work_hours"
                    ? `${cronStatus.config.workIntervalSeconds / 60}min`
                    : `${cronStatus.config.offHoursIntervalSeconds / 60}min`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Work hours:</span>
              <input
                type="number"
                min={0}
                max={23}
                value={cronStatus.config.workStartHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workStartHour: val });
                  }
                }}
                className="w-12 p-1 rounded border border-border text-sm"
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={cronStatus.config.workStartMinute}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workStartMinute: val });
                  }
                }}
                className="w-12 p-1 rounded border border-border text-sm"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="number"
                min={0}
                max={23}
                value={cronStatus.config.workEndHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workEndHour: val });
                  }
                }}
                className="w-12 p-1 rounded border border-border text-sm"
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={cronStatus.config.workEndMinute}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workEndMinute: val });
                  }
                }}
                className="w-12 p-1 rounded border border-border text-sm"
              />
            </div>
            <button
              onClick={handleCronRunNow}
              disabled={cronSaving || !cronStatus.enabled}
              className={`px-4 py-2 rounded border text-sm self-start ${
                cronSaving || !cronStatus.enabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed border-border"
                  : "bg-primary text-primary-foreground cursor-pointer border-transparent"
              }`}
            >
              {cronSaving ? "Running..." : "Run Now"}
            </button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg mb-3">Email Retention</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Read emails are automatically deleted from the local database after
          the retention period. Only unread emails are shown.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Delete read emails after
            </span>
            <input
              type="number"
              min={1}
              max={30}
              value={retentionDays}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 30) {
                  handleRetentionChange(val);
                }
              }}
              disabled={retentionSaving}
              className="w-12 p-1 rounded border border-border text-sm"
            />
            <span className="text-muted-foreground">days (1-30)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunCleanup}
              disabled={cleanupRunning}
              className={`px-4 py-2 rounded border text-sm self-start ${
                cleanupRunning
                  ? "bg-muted text-muted-foreground cursor-not-allowed border-border"
                  : "bg-primary text-primary-foreground cursor-pointer border-transparent"
              }`}
            >
              {cleanupRunning ? "Running..." : "Run Cleanup Now"}
            </button>
            {cleanupResult && (
              <span className="text-muted-foreground text-xs">
                Deleted {cleanupResult.deleted} email
                {cleanupResult.deleted !== 1 ? "s" : ""} |{" "}
                {cleanupResult.eligibleCount} eligible
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg mb-3">Account Colors</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Customize colors to identify accounts.
        </p>

        {gmailAccounts.length === 0 ? (
          <p className="text-muted-foreground text-sm mb-4">
            Connect an account to customize colors.
          </p>
        ) : (
          <div className="mb-4">
            {gmailAccounts.map((account) => {
              const accountColor = account.color || DEFAULT_COLOR;
              const isEditing = editingAccountId === account.id;

              return (
                <div
                  key={account.id}
                  className="border border-border rounded-lg mb-2 overflow-hidden"
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: accountColor }}
                      />
                      <span className="text-sm font-medium">
                        {account.email}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingAccountId(null);
                        } else {
                          setEditingAccountId(account.id);
                          setEditingColor(accountColor);
                          setHexInput("");
                          setHexError(null);
                        }
                      }}
                      className="bg-transparent border border-primary text-primary rounded px-2 py-1 cursor-pointer text-xs"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </button>
                  </div>

                  {isEditing && (
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="grid grid-cols-5 gap-2 mb-4 mt-3">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            aria-label={`Select color ${color}`}
                            onClick={() => {
                              setEditingColor(color);
                              setHexInput("");
                              setHexError(null);
                            }}
                            className="w-8 h-8 rounded-full border-2 cursor-pointer justify-self-center"
                            style={{
                              backgroundColor: color,
                              borderColor:
                                editingColor === color
                                  ? "hsl(var(--foreground))"
                                  : "transparent",
                            }}
                            title={color}
                          />
                        ))}
                      </div>

                      <div className="mb-3">
                        <label className="block text-sm mb-1">
                          Custom Color
                        </label>
                        <input
                          type="text"
                          placeholder="#RRGGBB"
                          value={hexInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHexInput(val);
                            if (val === "") {
                              setHexError(null);
                              return;
                            }
                            if (/^#[0-9a-f]{6}$/i.test(val)) {
                              setEditingColor(val.toLowerCase());
                              setHexError(null);
                            } else {
                              setHexError(
                                "Enter a valid hex color (e.g. #ff0000)",
                              );
                            }
                          }}
                          className="w-full p-2 rounded border border-border font-mono"
                        />
                        {hexError && (
                          <div className="text-destructive text-xs mt-1">
                            {hexError}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => handleApplyColor(account.id)}
                          disabled={colorSaving || hexError !== null}
                          className={`px-4 py-2 rounded border-none text-sm font-semibold ${
                            colorSaving || hexError
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-primary text-primary-foreground cursor-pointer"
                          }`}
                        >
                          {colorSaving ? "Saving..." : "Apply"}
                        </button>
                        <button
                          onClick={() => handleResetColor(account.id)}
                          disabled={colorSaving}
                          className={`px-4 py-2 rounded border border-muted text-muted-foreground text-sm ${
                            colorSaving
                              ? "cursor-not-allowed"
                              : "cursor-pointer"
                          }`}
                        >
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg mb-3">Add API Key</h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full p-2 rounded border border-border"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="litellm">liteLLM (Custom URL)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${PROVIDER_LABELS[provider]} Key`}
              className="w-full p-2 rounded border border-border"
            />
          </div>

          {provider === "litellm" && (
            <div>
              <label className="block text-sm mb-1">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:4000"
                className="w-full p-2 rounded border border-border"
              />
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 p-2 rounded border border-border"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="px-3 py-2 rounded border border-border bg-secondary cursor-pointer"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-destructive text-sm p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="text-green-500 dark:text-green-400 text-sm p-2 bg-green-500/10 rounded">
              API key saved and validated successfully.
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !apiKey}
            className={`px-5 py-2.5 rounded border-none text-sm font-semibold self-start ${
              saving || !apiKey
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground cursor-pointer"
            }`}
          >
            {saving ? "Validating & Saving..." : "Save API Key"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg mb-3">Saved API Keys</h2>
        {keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No API keys configured.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="text-left p-2">Label</th>
                <th className="text-left p-2">Provider</th>
                <th className="text-left p-2">Key</th>
                <th className="text-left p-2">Base URL</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-border">
                  <td className="p-2">{key.label}</td>
                  <td className="p-2">{PROVIDER_LABELS[key.provider]}</td>
                  <td className="p-2 font-mono">
                    {maskKey(key.label, key.provider)}
                  </td>
                  <td className="p-2 font-mono">{key.baseUrl ?? "—"}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="bg-transparent border border-destructive text-destructive rounded px-2 py-1 cursor-pointer text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8 border-t border-border pt-8">
        <h2 className="text-lg mb-3">Telemetry</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Help us improve by sharing anonymous usage statistics. No personal
          data is collected.
        </p>
        {telemetrySettings ? (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={telemetrySettings.optedIn}
                onChange={handleTelemetryToggle}
                disabled={telemetrySaving}
                className="w-5 h-5"
              />
              <span className="text-sm">
                {telemetrySettings.optedIn
                  ? "Telemetry enabled"
                  : "Telemetry disabled"}
              </span>
            </label>
            {telemetrySettings.consentedAt && (
              <span className="text-muted-foreground text-xs">
                Since:{" "}
                {new Date(telemetrySettings.consentedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
      </section>

      <section className="mt-8 border-t border-border pt-8">
        <h2 className="text-lg mb-3">AI Features</h2>
        <p className="text-muted-foreground text-sm mb-4">
          AI features classify your emails and send email subject, sender
          address, and preview snippet to external LLM providers
          (OpenAI/Anthropic). You provide your own API keys.
        </p>
        {aiConsentSettings ? (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aiConsentSettings.consented}
                onChange={handleAiConsentToggle}
                disabled={aiConsentSaving}
                className="w-5 h-5"
              />
              <span className="text-sm">
                {aiConsentSettings.consented
                  ? "AI features enabled"
                  : "AI features disabled"}
              </span>
            </label>
            {aiConsentSettings.consentedAt && (
              <span className="text-muted-foreground text-xs">
                Since:{" "}
                {new Date(aiConsentSettings.consentedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Loading...</p>
        )}
        <div className="mt-8">
          <NotificationPreferences />
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-8">
        <h2 className="text-lg mb-3">Classification Rules</h2>
        <ClassificationRules />
      </section>
    </div>
  );
}
