import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/runtime-mode";
export default function Home() { redirect(isDemoMode() ? "/demo" : "/dashboard"); }
