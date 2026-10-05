import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Smartphone } from "lucide-react";

/**
 * Point the page at the employee manifest while on the portal, so installing
 * from here opens the portal (not the admin login) with "My Pay" as its name.
 */
export function usePortalManifest() {
  useEffect(() => {
    const link = document.getElementById("app-manifest") as HTMLLinkElement | null;
    if (!link) return;
    const previous = link.href;
    link.href = `${import.meta.env.BASE_URL}manifest-portal.webmanifest`;
    return () => { link.href = previous; };
  }, []);
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install on your phone": uses Android/Chrome's own install prompt when it is
 * available, otherwise shows the steps (iPhone: Share > Add to Home Screen).
 * Hidden once the app is already running installed.
 */
export function InstallAppButton({ className, variant = "outline" }: { className?: string; variant?: "outline" | "default" | "ghost" }) {
  const [prompt, setPrompt] = useState<any>((window as any).__mavunoInstallPrompt ?? null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const ready = () => setPrompt((window as any).__mavunoInstallPrompt ?? null);
    const done = () => { setInstalled(true); (window as any).__mavunoInstallPrompt = null; };
    window.addEventListener("mavuno-install-ready", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("mavuno-install-ready", ready); window.removeEventListener("appinstalled", done); };
  }, []);

  if (installed) return null;

  async function install() {
    if (prompt) {
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      (window as any).__mavunoInstallPrompt = null;
      setPrompt(null);
    } else {
      setHelp(true);
    }
  }

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={install}>
        <Smartphone className="h-4 w-4 mr-2" />
        Install on your phone
      </Button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Mavuno on your phone</DialogTitle>
            <DialogDescription>It adds a "My Pay" icon to your home screen. Nothing to download from a store.</DialogDescription>
          </DialogHeader>
          {isIos() ? (
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              <li>Open this page in <strong>Safari</strong>.</li>
              <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            </ol>
          ) : (
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              <li>Open this page in <strong>Chrome</strong>.</li>
              <li>Tap the <strong>⋮</strong> menu at the top right.</li>
              <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</li>
            </ol>
          )}
          <p className="text-xs text-muted-foreground">You will still sign in with your usual email and password.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
