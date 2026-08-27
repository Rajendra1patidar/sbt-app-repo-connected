import React, { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { api } from "./lib/api";
import { AuthScreen } from "./components/AuthScreen";
import { InvoiceApp } from "./components/InvoiceApp";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!api.getToken());

  // If a stored token expires or is rejected mid-session, any API call
  // will 401. api.ts already clears the token in that case; this just
  // makes sure the UI follows and drops back to the login screen instead
  // of leaving the user stuck on a dashboard where nothing works.
  useEffect(() => api.onUnauthorized(() => setAuthed(false)), []);

  if (!authed) return <AuthScreen onAuthed={() => setAuthed(true)} />;
  return (
    <BrowserRouter>
      <InvoiceApp onSignOut={() => { api.setToken(null); setAuthed(false); }} />
    </BrowserRouter>
  );
}
