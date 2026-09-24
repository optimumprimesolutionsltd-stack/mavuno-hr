import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon } from "lucide-react";

/**
 * Shown to company admins until they have confirmed the overtime and loan
 * settings, by saving either or by choosing "keep defaults". It deliberately
 * comes back on every page load rather than being dismissible: a company
 * that has not understood the new options should keep being pointed at them.
 */
export function NewSettingsBanner() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = (user as any)?.role === "admin";

  const { data } = useQuery<{ org: { settingsReviewed?: boolean } }>({
    queryKey: ["admin-settings"],
    queryFn: () => customFetch("/api/settings") as Promise<any>,
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const keepDefaults = useMutation({
    mutationFn: () => customFetch("/api/settings/org", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settingsReviewed: true }),
    }),
    onSuccess: () => {
      toast({ title: "Settings confirmed", description: "You can change them any time in Settings." });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
  });

  if (!isAdmin || !data || data.org.settingsReviewed !== false) return null;

  return (
    <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <SettingsIcon className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">New settings for your company</p>
        <p className="text-muted-foreground">
          Choose which loan types you offer (and the longest repayment period), and whether your company pays overtime.
          Until you choose, employees see every loan type and the overtime field.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={() => setLocation("/admin/settings#loans")}>Review settings</Button>
        <Button size="sm" variant="outline" disabled={keepDefaults.isPending} onClick={() => keepDefaults.mutate()}>
          Keep defaults
        </Button>
      </div>
    </div>
  );
}
