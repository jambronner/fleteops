import { getAppUrl, getMarketingUrl } from "@/lib/env";

export const APP_DASHBOARD_PATH = "/dashboard";
export const APP_LOGIN_PATH = "/login";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

export function getHostnameFromHostHeader(hostHeader: string | null | undefined) {
  const host = hostHeader?.trim();

  if (!host) {
    return null;
  }

  try {
    return normalizeHostname(new URL(`http://${host}`).hostname);
  } catch {
    const [hostname] = host.split(":");
    return hostname ? normalizeHostname(hostname) : null;
  }
}

function getHostnameFromUrl(value: string) {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
}

export function isLocalHostname(hostname: string | null | undefined) {
  return hostname ? LOCAL_HOSTNAMES.has(normalizeHostname(hostname)) : false;
}

export function getConfiguredAppHostname() {
  return getHostnameFromUrl(getAppUrl());
}

export function hasExternalAppHost() {
  const appHostname = getConfiguredAppHostname();
  return Boolean(appHostname && !isLocalHostname(appHostname));
}

export function isConfiguredAppHost(hostHeader: string | null | undefined) {
  const requestHostname = getHostnameFromHostHeader(hostHeader);
  const appHostname = getConfiguredAppHostname();

  if (!requestHostname || !appHostname || isLocalHostname(appHostname)) {
    return false;
  }

  return requestHostname === appHostname;
}

export function getAppHomePathForHost(hostHeader: string | null | undefined) {
  return isConfiguredAppHost(hostHeader) ? "/" : APP_DASHBOARD_PATH;
}

export function getAppHomePathForConfiguredUrl() {
  const appHostname = getConfiguredAppHostname();
  return appHostname && !isLocalHostname(appHostname) ? "/" : APP_DASHBOARD_PATH;
}

export function getAppAbsoluteUrl(path: string) {
  return new URL(path, getAppUrl()).toString();
}

export function getAppLoginUrl() {
  return getAppAbsoluteUrl(APP_LOGIN_PATH);
}

export function getMarketingHomeUrl(fallbackUrl: string) {
  return new URL("/", getMarketingUrl() ?? fallbackUrl).toString();
}
