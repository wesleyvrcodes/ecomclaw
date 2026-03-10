"use client";

import { useState, useEffect } from "react";
import { User, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function AccountPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/settings", { userName: name, userEmail: email });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail for now
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#0a0a0a] border-[#27272a]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <User className="h-5 w-5 text-blue-500" />
          Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-zinc-300 mb-1.5">Full Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
          />
        </div>
        <div>
          <Label className="text-zinc-300 mb-1.5">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
