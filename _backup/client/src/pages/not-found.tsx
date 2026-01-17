import { Link } from "wouter";
import { Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-hud-grid bg-[size:30px_30px] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-2 text-wild-brand mb-6">
          <Zap className="w-8 h-8 fill-current" />
          <span className="font-black italic tracking-tighter text-2xl text-white">WILDCARD</span>
        </div>
        
        <div className="font-mono text-6xl font-black text-zinc-700 mb-4">404</div>
        
        <h1 className="text-xl font-bold text-white mb-2">Page Not Found</h1>
        <p className="text-sm text-zinc-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        
        <Link href="/">
          <Button className="bg-wild-brand text-zinc-950 font-bold" data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Terminal
          </Button>
        </Link>
      </div>
    </div>
  );
}
