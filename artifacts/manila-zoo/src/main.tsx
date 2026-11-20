import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { supabase } from "./lib/supabase";
import { registerServiceWorker } from "./lib/offline";
import { installNavHistory } from "./lib/navHistory";

// Numbers history entries for the Back button and turns off the browser's scroll restoration (after
// App's imports, so wouter has already hooked into the history API)
installNavHistory();

setAuthTokenGetter(async () => {
	const { data } = await supabase.auth.getSession();
	return data.session?.access_token ?? null;
});

// A phone that opened the site before a rebuild asks for page files that no longer exist; reload
// once to get the new version instead of showing a broken page (at most once a minute)
window.addEventListener("vite:preloadError", (event) => {
	try {
		const last = Number(sessionStorage.getItem("zoo-reload-at") || 0);
		if (Date.now() - last < 60_000) return;
		sessionStorage.setItem("zoo-reload-at", String(Date.now()));
	} catch {
		// No session storage: still reload once
	}
	event.preventDefault();
	window.location.reload();
});

// Saves pages, zoo data, map tiles and photos so the app keeps working without signal
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
