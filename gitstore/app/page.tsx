import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/SignInButton";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <span className="text-3xl font-bold tracking-tight">
          Git<span className="text-emerald-400">Store</span>
        </span>
      </div>

      <h1 className="text-4xl md:text-5xl font-extrabold text-center max-w-2xl leading-tight mb-4">
        Your GitHub Account as an{" "}
        <span className="text-emerald-400">Infinite File System</span>
      </h1>
      <p className="text-gray-400 text-center max-w-lg mb-10 text-lg">
        Upload, search, and retrieve files of any format. Powered by GitHub repos with
        HDFS-inspired architecture — deduplication, chunking, and multi-layer caching built in.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12 max-w-2xl w-full">
        {features.map((f) => (
          <div key={f.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
            <span className="text-emerald-400 text-xl">{f.icon}</span>
            <div>
              <p className="font-semibold text-sm text-gray-100">{f.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{f.description}</p>
            </div>
          </div>
        ))}
      </div>

      <SignInButton />

      <p className="mt-4 text-xs text-gray-600">
        Your files stay in <span className="text-gray-400">your</span> GitHub repositories.
        GitStore never stores your data.
      </p>
    </main>
  );
}

const features = [
  { icon: "🗂", label: "Data Nodes", description: "Separate repos per category (photos, docs, …)" },
  { icon: "🔍", label: "Instant Search", description: "O(1) keyword lookup from in-memory index" },
  { icon: "⚡", label: "5-Layer Cache", description: "IndexedDB + Service Worker + CDN proxy" },
  { icon: "♻️", label: "Deduplication", description: "SHA-256 content hashing — no double uploads" },
  { icon: "🔒", label: "Private Repos", description: "All data stored in your private GitHub repos" },
  { icon: "💾", label: "Fault Tolerance", description: "Secondary name-node mirrors the master index" },
];
