import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { AppProvider } from "./contexts/AppContext";
import { AppNavbar } from "./components/layout/AppNavbar";
import { Footer } from "./components/layout/Footer";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { InAppBrowserBanner } from "./components/layout/InAppBrowserBanner";
import { AiGuideButton } from "./components/fun/AiGuideButton";
import { EntryWindow } from "./components/EntryWindow";
import { ScrollToTop } from "./components/layout/ScrollToTop";

import { lazy, Suspense } from "react";

// Pages phones open first from a QR code load with the app; every other page is downloaded only
// when it is opened, so the first download on a phone stays small.
import Home from "./pages/visitor/Home";
import QrScan from "./pages/visitor/QrScan";
import VisitorRegistration from "./pages/visitor/VisitorRegistration";
import NotFound from "./pages/not-found";

// Visitor Pages
const Animals = lazy(() => import("./pages/visitor/Animals"));
const AnimalProfile = lazy(() => import("./pages/visitor/AnimalProfile"));
const InteractiveMap = lazy(() => import("./pages/visitor/Map"));
const Chat = lazy(() => import("./pages/visitor/Chat"));
const Events = lazy(() => import("./pages/visitor/Events"));
const Help = lazy(() => import("./pages/visitor/Help"));
const Visit = lazy(() => import("./pages/visitor/Visit"));
const Login = lazy(() => import("./pages/visitor/Login"));

// Admin Pages
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminAnimals = lazy(() => import("./pages/admin/Animals"));
const AdminMapEditor = lazy(() => import("./pages/admin/MapEditor"));
const AdminQrCodes = lazy(() => import("./pages/admin/QrCodes"));
const AdminChatbotConfig = lazy(() => import("./pages/admin/ChatbotConfig"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const ZooUpdatesAdmin = lazy(() => import("./pages/admin/DatasetPages").then((m) => ({ default: m.ZooUpdatesAdmin })));
const TicketPricesAdmin = lazy(() => import("./pages/admin/DatasetPages").then((m) => ({ default: m.TicketPricesAdmin })));
const AnnouncementsAdmin = lazy(() => import("./pages/admin/DatasetPages").then((m) => ({ default: m.AnnouncementsAdmin })));
const EventsAdmin = lazy(() => import("./pages/admin/DatasetPages").then((m) => ({ default: m.EventsAdmin })));
const AdminQrAccess = lazy(() => import("./pages/admin/QrAccess"));
const AdminSubmissions = lazy(() => import("./pages/admin/Submissions"));
const AdminVisitorRegistrations = lazy(() => import("./pages/admin/VisitorRegistrations"));
const AdminBackup = lazy(() => import("./pages/admin/Backup"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const AdminSettings = lazy(() => import("./pages/admin/SystemSettings"));
const AdminFeedback = lazy(() => import("./pages/admin/Feedback"));
const AdminGames = lazy(() => import("./pages/admin/Games"));
const AdminAccounts = lazy(() => import("./pages/admin/AdminAccounts"));
const AdminFacilities = lazy(() => import("./pages/admin/Facilities"));
const AdminParkAreas = lazy(() => import("./pages/admin/ParkAreas"));
const AdminNavigationDemo = lazy(() => import("./pages/admin/NavigationDemo"));

// Shown for the moment a page is downloading
// Fills the screen below the navbar while a page's code downloads, so the footer stays below the
// fold instead of jumping down when the page arrives (that jump was most of each page's layout shift)
function PageLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminRouter() {
  return (
    <ProtectedRoute adminOnly>
      <AdminLayout>
        <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/admin" component={Dashboard} />
          <Route path="/admin/animals" component={AdminAnimals} />
          <Route path="/admin/map" component={AdminMapEditor} />
          <Route path="/admin/facilities" component={AdminFacilities} />
          <Route path="/admin/park-areas" component={AdminParkAreas} />
          {/* Live navigation with a simulated GPS, for demos away from the zoo (admin portal only) */}
          <Route path="/admin/navigation-demo" component={AdminNavigationDemo} />
          <Route path="/admin/qr" component={AdminQrCodes} />
          <Route path="/admin/chatbot" component={AdminChatbotConfig} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/admin-accounts" component={AdminAccounts} />
          <Route path="/admin/datasets" component={ZooUpdatesAdmin} />
          <Route path="/admin/tickets" component={TicketPricesAdmin} />
          <Route path="/admin/announcements" component={AnnouncementsAdmin} />
          <Route path="/admin/events" component={EventsAdmin} />
          <Route path="/admin/qr-access" component={AdminQrAccess} />
          <Route path="/admin/submissions" component={AdminSubmissions} />
          <Route path="/admin/visitor-registrations" component={AdminVisitorRegistrations} />
          <Route path="/admin/backup" component={AdminBackup} />
          <Route path="/admin/audit" component={AdminAuditLogs} />
          <Route path="/admin/settings" component={AdminSettings} />
          <Route path="/admin/feedback" component={AdminFeedback} />
          <Route path="/admin/games" component={AdminGames} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
      </AdminLayout>
    </ProtectedRoute>
  );
}

function VisitorRouter() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppNavbar />
      <OfflineBanner />
      <InAppBrowserBanner />
      <main className="flex-1">
        <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/map" component={InteractiveMap} />
          <Route path="/animals" component={Animals} />
          <Route path="/animals/:id" component={AnimalProfile} />
          <Route path="/qr-scan" component={QrScan} />
          {/* Short link printed in exhibit QR codes (/q/MNL-ZOO-…): fewer squares, easier for phone cameras */}
          <Route path="/q/:code" component={QrScan} />
          <Route path="/chat" component={Chat} />
          <Route path="/events" component={Events} />
          <Route path="/help">{() => <Help />}</Route>
          <Route path="/faq">{() => <Help initialTab="faq" />}</Route>
          <Route path="/rules">{() => <Help initialTab="rules" />}</Route>
          <Route path="/visit" component={Visit} />
          {/* Opened by the website QR code; visitors are counted when this form is saved */}
          <Route path="/visitor-registration" component={VisitorRegistration} />
          <Route path="/login" component={Login} />
          {/* Older links to the short sign-up form open the complete registration form */}
          <Route path="/register"><Redirect to="/visitor-registration?view=signup" replace /></Route>
          {/* The short address the website QR code holds */}
          <Route path="/r"><Redirect to="/visitor-registration" replace /></Route>
          {/* Favorites are now a filter on the Animals page */}
          <Route path="/favorites"><Redirect to="/animals?favorites=1" replace /></Route>
          <Route component={NotFound} />
        </Switch>
        </Suspense>
      </main>
      <Footer />
      <AiGuideButton />
      <EntryWindow />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              {/* Every page, visitor and admin, opens at the top */}
              <ScrollToTop />
              <Switch>
                <Route path="/admin/*" component={AdminRouter} />
                <Route path="/admin" component={AdminRouter} />
                <Route component={VisitorRouter} />
              </Switch>
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
