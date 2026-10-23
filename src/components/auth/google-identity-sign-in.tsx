"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityClient = {
  initialize: (options: {
    callback: (response: GoogleCredentialResponse) => void;
    client_id: string;
    context: "signin";
    itp_support: boolean;
    ux_mode: "popup";
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      logo_alignment: "center" | "left";
      shape: "pill" | "rectangular" | "circle" | "square";
      size: "large" | "medium" | "small";
      text: "continue_with" | "signin_with" | "signup_with";
      theme: "outline" | "filled_blue" | "filled_black";
      type: "standard" | "icon";
      width: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityClient;
      };
    };
  }
}

type GoogleIdentitySignInProps = {
  appHomePath: string;
  clientId: string;
  locale: string;
};

type SessionCompletionResponse = {
  redirectTo?: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      fallback: "Continue with Google",
      missingClient: "Supabase auth is not configured in this browser session.",
      missingCredential: "Google did not return a sign-in credential.",
      genericError: "Google sign-in failed. Please try again.",
    };
  }

  return {
    fallback: "Continuar con Google",
    missingClient: "Supabase auth no está configurado en esta sesión del navegador.",
    missingCredential: "Google no regresó una credencial de acceso.",
    genericError: "No se pudo iniciar sesión con Google. Intenta otra vez.",
  };
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="size-5 flex-shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleIdentitySignIn({ appHomePath, clientId, locale }: GoogleIdentitySignInProps) {
  const copy = copyForLocale(locale);
  const buttonRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const initializedRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState("");

  const handleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    setError("");

    if (!response.credential) {
      setError(copy.missingCredential);
      return;
    }

    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setError(copy.missingClient);
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: response.credential,
    });

    if (signInError || !data.user) {
      setError(signInError?.message ?? copy.genericError);
      return;
    }

    let redirectTo = appHomePath;

    try {
      const completionResponse = await fetch("/api/auth/supabase/session", {
        cache: "no-store",
        method: "POST",
      });
      const completion = (await completionResponse.json().catch(() => ({}))) as SessionCompletionResponse;
      redirectTo = completion.redirectTo ?? redirectTo;
    } catch {
      redirectTo = appHomePath;
    }

    window.location.assign(redirectTo);
  }, [appHomePath, copy.genericError, copy.missingClient, copy.missingCredential]);

  useEffect(() => {
    const googleIdentity = window.google?.accounts?.id;
    const buttonElement = buttonRef.current;

    if (!scriptReady || !googleIdentity || !buttonElement || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    googleIdentity.initialize({
      client_id: clientId,
      callback: (response) => void handleCredential(response),
      context: "signin",
      ux_mode: "popup",
      itp_support: true,
    });

    buttonElement.innerHTML = "";
    const width = Math.min(376, Math.max(240, Math.floor(buttonElement.getBoundingClientRect().width || 320)));
    googleIdentity.renderButton(buttonElement, {
      theme: "outline",
      size: "large",
      type: "standard",
      text: "continue_with",
      shape: "rectangular",
      width,
      logo_alignment: "center",
    });
    fallbackRef.current?.setAttribute("hidden", "true");
  }, [clientId, handleCredential, scriptReady]);

  return (
    <>
      <Script
        onReady={() => setScriptReady(true)}
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      <div className="relative min-h-11">
        <div ref={buttonRef} className="flex min-h-11 justify-center" />
        <button
          ref={fallbackRef}
          className="absolute inset-0 flex h-11 w-full cursor-wait items-center justify-center gap-3 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-ink opacity-80"
          disabled
          type="button"
        >
          <GoogleLogo />
          <span>{copy.fallback}</span>
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </>
  );
}
