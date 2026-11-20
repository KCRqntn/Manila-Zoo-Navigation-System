import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { isStaffRole } from "@/lib/adminApi";

export function ProtectedRoute({ 
  children, 
  adminOnly = false 
}: { 
  children: React.ReactNode, 
  adminOnly?: boolean 
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirects replace the page that sent them, so Back doesn't return to it and redirect again
  if (!user) {
    return <Redirect to="/login" replace />;
  }

  // Staff roles (admin, editor, viewer) open the dashboard; each page and the server check permissions
  if (adminOnly && !isStaffRole(user.role)) {
    return <Redirect to="/" replace />;
  }

  return <>{children}</>;
}
